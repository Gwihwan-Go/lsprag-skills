#!/usr/bin/env node
/**
 * deep-think-cli.ts — BFS code understanding: expand a symbol to all its dependencies
 *
 * Usage:
 *   lsprag deep-think --file <path> --symbol <name> [--depth <n>]
 *
 * For each symbol encountered (starting from the root), this tool:
 *   1. Retrieves the full source of the symbol (retrieve-def logic)
 *   2. Lists all token dependencies (token-defs logic)
 *   3. Enqueues each unvisited dependency for the next BFS level
 *
 * Output: one section per symbol, grouped by depth level.
 * Useful for: writing tests, pre-refactor audits, understanding complex call chains.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDecodedTokensFromSymbolWithDefs } from "../src/tokenDefsCore.js";
import type { TokenProvider } from "../src/tokenCore.js";

// ── arg parsing ───────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      result[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const filePath   = args["file"] ?? args["f"];
const symbolName = args["symbol"] ?? args["s"];
const maxDepth   = parseInt(args["depth"] ?? "2", 10);

if (!filePath || !symbolName) {
  console.error("Usage: deep-think-cli.ts --file <path> --symbol <name> [--depth <n>]");
  process.exit(1);
}

const rootPath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), filePath);

if (!fs.existsSync(rootPath)) {
  console.error(`Error: file not found: ${rootPath}`);
  process.exit(1);
}

// ── text utilities ────────────────────────────────────────────────────────────
function buildLineOffsets(src: string): number[] {
  const offs = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") offs.push(i + 1);
  }
  return offs;
}

function positionAt(offset: number, lineOffsets: number[]) {
  let lo = 0, hi = lineOffsets.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lineOffsets[mid] > offset) hi = mid; else lo = mid + 1;
  }
  const line = Math.max(0, lo - 1);
  return { line, character: offset - lineOffsets[line] };
}

function rangeFromOffsets(s: number, e: number, lineOffsets: number[]) {
  return { start: positionAt(s, lineOffsets), end: positionAt(e, lineOffsets) };
}

function findBraceBlockEnd(text: string, startIndex: number): number {
  const braceStart = text.indexOf("{", startIndex);
  if (braceStart === -1) return text.length;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
    if (depth === 0) return i + 1;
  }
  return text.length;
}

// ── per-file analysis helpers ─────────────────────────────────────────────────
type SymbolInfo = {
  name: string;
  range: ReturnType<typeof rangeFromOffsets>;
  selectionRange: ReturnType<typeof rangeFromOffsets>;
  children: never[];
};

type DepEntry = { name: string; file: string; line: number; col: number };

function loadFile(absPath: string): {
  text: string;
  lineOffsets: number[];
  langId: string;
  docUri: string;
  symbols: SymbolInfo[];
  lines: string[];
} {
  const text = fs.readFileSync(absPath, "utf8");
  const lineOffsets = buildLineOffsets(text);
  const ext = path.extname(absPath).toLowerCase();
  const langId = ext === ".go" ? "go" : ext === ".py" ? "python" : "typescript";
  const docUri = pathToFileURL(absPath).href;
  const lines = text.split("\n");

  const symbolRegex =
    langId === "go"     ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : langId === "python" ? /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  const definitionsByName = new Map<string, { uri: string; range: ReturnType<typeof rangeFromOffsets> }>();
  const symbols: SymbolInfo[] = [];

  let m: RegExpExecArray | null;
  while ((m = symbolRegex.exec(text))) {
    const name = m[1];
    const nameOffset = m.index + m[0].indexOf(name);
    const end = findBraceBlockEnd(text, m.index);
    const sym: SymbolInfo = {
      name,
      range: rangeFromOffsets(m.index, end, lineOffsets),
      selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
      children: [] as never[],
    };
    symbols.push(sym);
    definitionsByName.set(name, { uri: docUri, range: sym.selectionRange });
  }

  return { text, lineOffsets, langId, docUri, symbols, lines };
}

function makeProvider(fileData: ReturnType<typeof loadFile>): TokenProvider {
  const { text, lineOffsets, langId, docUri, symbols, lines } = fileData;

  const definitionsByName = new Map<string, { uri: string; range: ReturnType<typeof rangeFromOffsets> }>();
  for (const sym of symbols) {
    definitionsByName.set(sym.name, { uri: docUri, range: sym.selectionRange });
  }

  const document = {
    uri: docUri,
    languageId: langId,
    getText(range?: { start: { line: number; character: number }; end: { line: number; character: number } }): string {
      if (!range) return text;
      const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
      const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
      return text.slice(s, e);
    },
  };

  function encodeSemanticTokens() {
    const tokens: { line: number; char: number; length: number }[] = [];
    const id = /[A-Za-z_][A-Za-z0-9_]*/g;
    lines.forEach((lineText, line) => {
      let tok: RegExpExecArray | null;
      while ((tok = id.exec(lineText))) {
        tokens.push({ line, char: tok.index, length: tok[0].length });
      }
    });
    const sorted = tokens.sort((a, b) => a.line - b.line || a.char - b.char);
    const data: number[] = [];
    let pl = 0, pc = 0;
    for (const t of sorted) {
      const dl = t.line - pl;
      data.push(dl, dl === 0 ? t.char - pc : t.char, t.length, 0, 0);
      pl = t.line; pc = t.char;
    }
    return { data };
  }

  return {
    openDocument: async () => document,
    getDocumentSymbols: async () => symbols,
    getDefinitions: async (_doc, position) => {
      const lineText = lines[position.line] ?? "";
      let ws = Math.min(position.character, lineText.length);
      let we = ws;
      while (ws > 0 && /[A-Za-z0-9_]/.test(lineText[ws - 1])) ws--;
      while (we < lineText.length && /[A-Za-z0-9_]/.test(lineText[we])) we++;
      const word = lineText.slice(ws, we);
      const loc = definitionsByName.get(word);
      return loc ? [loc] : [];
    },
    getSemanticTokens: async () => encodeSemanticTokens(),
    getSemanticTokensLegend: async () => ({ tokenTypes: ["symbol"], tokenModifiers: [] }),
    getSemanticTokensRange: async () => null,
    getSemanticTokensLegendRange: async () => null,
  };
}

function getRangeText(text: string, lineOffsets: number[], range: { start: { line: number; character: number }; end: { line: number; character: number } }): string {
  const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
  const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
  return text.slice(s, e).trimEnd();
}

// ── BFS ───────────────────────────────────────────────────────────────────────
type QueueItem = { file: string; symbol: string; depth: number };

const visited = new Set<string>(); // "file::symbol"
const queue: QueueItem[] = [{ file: rootPath, symbol: symbolName, depth: 0 }];

const relPath = (p: string) => path.relative(process.cwd(), p) || p;

// ── BFS metrics ──────────────────────────────────────────────────────────────
let symbolsVisited = 0;
let maxDepthReached = 0;
const leafNodes: Array<{ name: string; file: string }> = [];
const truncatedNodes: Array<{ name: string; file: string; depth: number }> = [];
const notFoundNodes: string[] = [];

console.log(`# Deep Think: '${symbolName}' (max depth: ${maxDepth})`);
console.log(`# File: ${relPath(rootPath)}`);
console.log("");

while (queue.length > 0) {
  const item = queue.shift()!;
  const key = `${item.file}::${item.symbol}`;
  if (visited.has(key)) continue;
  visited.add(key);

  // Load file data
  let fileData: ReturnType<typeof loadFile>;
  try {
    fileData = loadFile(item.file);
  } catch {
    console.log(`## Level ${item.depth}: ${item.symbol} — ERROR: could not read ${relPath(item.file)}`);
    console.log("");
    continue;
  }

  const target = fileData.symbols.find(s => s.name === item.symbol);
  if (!target) {
    const available = fileData.symbols.map(s => s.name).join(", ");
    console.log(`## Level ${item.depth}: ${item.symbol} — NOT FOUND in ${relPath(item.file)}`);
    if (available) console.log(`Available: ${available}`);
    console.log("");
    notFoundNodes.push(item.symbol);
    continue;
  }

  symbolsVisited++;
  maxDepthReached = Math.max(maxDepthReached, item.depth);

  // Print header + full source
  const symLine = target.selectionRange.start.line + 1;
  const symCol  = target.selectionRange.start.character + 1;
  const src = getRangeText(fileData.text, fileData.lineOffsets, target.range);
  console.log(`## Level ${item.depth}: ${item.symbol} (${relPath(item.file)}:${symLine}:${symCol})`);
  console.log("");
  console.log("```");
  console.log(src);
  console.log("```");
  console.log("");

  // Get token dependencies
  const provider = makeProvider(fileData);
  const document = {
    uri: fileData.docUri,
    languageId: fileData.langId,
    getText(range?: { start: { line: number; character: number }; end: { line: number; character: number } }): string {
      if (!range) return fileData.text;
      const s = (fileData.lineOffsets[range.start.line] ?? 0) + range.start.character;
      const e = (fileData.lineOffsets[range.end.line]   ?? 0) + range.end.character;
      return fileData.text.slice(s, e);
    },
  };

  const tokens = await getDecodedTokensFromSymbolWithDefs(document, target, provider);
  const resolved = tokens.filter(t => t.definition && t.definition.length > 0 && t.word && t.word !== item.symbol);

  if (resolved.length === 0) {
    leafNodes.push({ name: item.symbol, file: item.file });
  } else if (item.depth >= maxDepth) {
    truncatedNodes.push({ name: item.symbol, file: item.file, depth: item.depth });
  }

  if (resolved.length > 0) {
    console.log("**Dependencies:**");
    console.log("");
    const maxWord = Math.max(...resolved.map(t => (t.word ?? "").length), 6);
    const deps: DepEntry[] = [];

    for (const tok of resolved) {
      const word = (tok.word ?? "").padEnd(maxWord);
      const tLine = String(tok.line + 1).padStart(4);
      const tCol  = String(tok.startChar + 1).padStart(3);
      const def   = tok.definition![0];
      const defFile = def.uri.startsWith("file://") ? new URL(def.uri).pathname : def.uri;
      const defRel  = path.relative(process.cwd(), defFile) || defFile;
      const defLine = def.range.start.line + 1;
      const defCol  = def.range.start.character + 1;
      console.log(`  L${tLine}:C${tCol}  ${word}  ->  ${defRel}:${defLine}:${defCol}`);

      // Enqueue for next BFS level
      if (item.depth < maxDepth) {
        const depKey = `${defFile}::${tok.word}`;
        if (!visited.has(depKey)) {
          deps.push({ name: tok.word ?? "", file: defFile, line: defLine, col: defCol });
        }
      }
    }

    // Deduplicate and enqueue
    const seen = new Set<string>();
    for (const dep of deps) {
      const depKey = `${dep.file}::${dep.name}`;
      if (!seen.has(depKey)) {
        seen.add(depKey);
        queue.push({ file: dep.file, symbol: dep.name, depth: item.depth + 1 });
      }
    }

    console.log("");
  } else {
    console.log("_No resolved dependencies (regex mode: only same-file functions are tracked)_");
    console.log("");
  }

  // Separator between levels
  if (queue.length > 0 && queue[0].depth > item.depth) {
    console.log("---");
    console.log("");
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("---");
console.log("");
console.log("## Summary");
console.log("");
console.log(`| Metric | Value |`);
console.log(`|--------|-------|`);
console.log(`| Root symbol | \`${symbolName}\` (${relPath(rootPath)}) |`);
console.log(`| Symbols visited | ${symbolsVisited} |`);
console.log(`| Max depth reached | ${maxDepthReached} |`);
if (leafNodes.length > 0) {
  console.log(`| Leaf nodes | ${leafNodes.map(n => n.name).join(", ")} |`);
}
if (truncatedNodes.length > 0) {
  console.log(`| Truncated (depth limit) | ${truncatedNodes.map(n => n.name).join(", ")} |`);
}
if (notFoundNodes.length > 0) {
  console.log(`| Unresolved | ${notFoundNodes.join(", ")} |`);
}
console.log("");

// ── Agent Instructions ───────────────────────────────────────────────────────
console.log("## Agent Instructions");
console.log("");
console.log("Continue exploring with these commands:");
console.log("");

// Suggest getDefinition for leaf nodes (they have source but no resolved deps — may want full context)
if (leafNodes.length > 0) {
  console.log("### Look up leaf node definitions");
  for (const leaf of leafNodes.slice(0, 5)) {
    console.log(`\`lsprag getDefinition --file "$(realpath ${relPath(leaf.file)})" --symbol ${leaf.name}\``);
  }
  console.log("");
}

// Suggest getTokens for truncated nodes (hit depth limit — may have more deps to discover)
if (truncatedNodes.length > 0) {
  console.log("### Explore truncated branches (hit depth limit)");
  for (const trunc of truncatedNodes.slice(0, 5)) {
    console.log(`\`lsprag getTokens --file "$(realpath ${relPath(trunc.file)})" --symbol ${trunc.name}\``);
  }
  console.log("");
}

// Suggest getReference for root symbol
console.log("### Find callers of the root symbol");
console.log(`\`lsprag getReference --file "$(realpath ${relPath(rootPath)})" --symbol ${symbolName}\``);
console.log("");

// Suggest rg for the root symbol
console.log("### Search for related patterns");
console.log(`\`rg -n "${symbolName}" . --type ${path.extname(rootPath) === ".go" ? "go" : "ts"}\``);
console.log("");
