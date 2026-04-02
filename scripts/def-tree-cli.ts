#!/usr/bin/env node
/**
 * def-tree-cli.ts — standalone CLI for lsprag-def-tree
 *
 * Usage:
 *   npx tsx /path/to/lsprag-skills/scripts/def-tree-cli.ts \
 *     --file /path/to/source.ts \
 *     --symbol myFunction \
 *     [--depth 3]
 *
 * Claude Code agents can invoke this via the Bash tool:
 *   tsx $LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts --file foo.ts --symbol bar
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildDefTree, prettyPrintDefTree } from "../src/treeCore.js";

console.error("[Disabled] def-tree is temporarily unsupported.");
console.error("Use retrieve-def, token-defs, or deep-think instead.");
process.exit(2);

// ── arg parsing ──────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      result[key] = argv[i + 1];
      i++;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const filePath = args["file"] || args["f"];
const symbolName = args["symbol"] || args["s"];
const maxDepth = args["depth"] ? parseInt(args["depth"], 10) : 3;

if (!filePath || !symbolName) {
  console.error("Usage: def-tree-cli.ts --file <path> --symbol <name> [--depth <n>]");
  process.exit(1);
}

const absolutePath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Error: file not found: ${absolutePath}`);
  process.exit(1);
}

// ── self-contained provider (regex-based, no LSP server needed) ──────────────
const text = fs.readFileSync(absolutePath, "utf8");
const lines = text.split("\n");

function buildLineOffsets(src: string): number[] {
  const offsets = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

const lineOffsets = buildLineOffsets(text);

function positionAt(offset: number): { line: number; character: number } {
  let low = 0, high = lineOffsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] > offset) high = mid;
    else low = mid + 1;
  }
  const line = Math.max(0, low - 1);
  return { line, character: offset - lineOffsets[line] };
}

function rangeFromOffsets(s: number, e: number) {
  return { start: positionAt(s), end: positionAt(e) };
}

const extension = path.extname(absolutePath).toLowerCase();
const languageId = extension === ".go" ? "go" : "typescript";

function buildFunctionSymbols() {
  const regex =
    languageId === "go"
      ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
      : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const symbols: Array<{
    name: string;
    range: ReturnType<typeof rangeFromOffsets>;
    selectionRange: ReturnType<typeof rangeFromOffsets>;
    children: never[];
  }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const name = match[1];
    const nameOffset = match.index + match[0].indexOf(name);
    const braceStart = text.indexOf("{", match.index);
    let braceEnd = text.length;
    if (braceStart !== -1) {
      let depth = 0;
      for (let i = braceStart; i < text.length; i++) {
        if (text[i] === "{") depth++;
        if (text[i] === "}") depth--;
        if (depth === 0) { braceEnd = i + 1; break; }
      }
    }
    symbols.push({
      name,
      range: rangeFromOffsets(match.index, braceEnd),
      selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length),
      children: [] as never[],
    });
  }
  return symbols;
}

const symbols = buildFunctionSymbols();
const definitionsByName = new Map<string, { uri: string; range: ReturnType<typeof rangeFromOffsets> }>();
const docUri = pathToFileURL(absolutePath).href;
for (const sym of symbols) {
  definitionsByName.set(sym.name, { uri: docUri, range: sym.selectionRange });
}

function encodeSemanticTokens() {
  const tokens: { line: number; char: number; length: number }[] = [];
  const identifier = /[A-Za-z_][A-Za-z0-9_]*/g;
  lines.forEach((lineText, line) => {
    let m: RegExpExecArray | null;
    while ((m = identifier.exec(lineText))) {
      tokens.push({ line, char: m.index, length: m[0].length });
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

function getWordAt(pos: { line: number; character: number }): string {
  const lineText = lines[pos.line] ?? "";
  let s = Math.min(pos.character, lineText.length);
  let e = s;
  const isW = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (s > 0 && isW(lineText[s - 1])) s--;
  while (e < lineText.length && isW(lineText[e])) e++;
  return lineText.slice(s, e);
}

const document = {
  uri: docUri,
  languageId,
  getText: (range?: { start: { line: number; character: number }; end: { line: number; character: number } }) => {
    if (!range) return text;
    const s = lineOffsets[range.start.line] + range.start.character;
    const e = lineOffsets[range.end.line] + range.end.character;
    return text.slice(s, e);
  },
};

const provider = {
  openDocument: async () => document,
  getDocumentSymbols: async () => symbols,
  getDefinitions: async (_doc: unknown, position: { line: number; character: number }) => {
    const word = getWordAt(position);
    const loc = definitionsByName.get(word);
    return loc ? [loc] : [];
  },
  getSemanticTokens: async () => encodeSemanticTokens(),
  getSemanticTokensLegend: async () => ({ tokenTypes: ["function"], tokenModifiers: [] }),
  getSemanticTokensRange: async () => null,
  getSemanticTokensLegendRange: async () => null,
};

// ── run ───────────────────────────────────────────────────────────────────────
const target = symbols.find((s) => s.name === symbolName);
if (!target) {
  const available = symbols.map((s) => s.name).join(", ");
  console.error(`Error: symbol "${symbolName}" not found in ${absolutePath}`);
  console.error(`Available: ${available || "(none detected)"}`);
  process.exit(1);
}

const tree = await buildDefTree(document, target, provider, maxDepth);
console.log(prettyPrintDefTree(tree));
