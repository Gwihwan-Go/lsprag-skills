#!/usr/bin/env node
/**
 * token-defs-cli.ts — decompose a symbol into tokens and annotate with definition locations
 *
 * Usage:
 *   lsprag token-defs --file <path> --symbol <name>
 *
 * Output:
 *   For each identifier token in the symbol body that has a resolved definition,
 *   prints: line:col | token-name -> definition-file:line:col
 *
 * Uses regex-based analysis by default (no LSP server required).
 * For cross-file definitions, set LSPRAG_LSP_PROVIDER.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDecodedTokensFromSymbolWithDefs } from "../src/tokenDefsCore.js";
import type { TokenProvider } from "../src/tokenCore.js";

// ── arg parsing ──────────────────────────────────────────────────────────────
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

if (!filePath || !symbolName) {
  console.error("Usage: token-defs-cli.ts --file <path> --symbol <name>");
  process.exit(1);
}

const absolutePath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Error: file not found: ${absolutePath}`);
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

// ── build inline provider ─────────────────────────────────────────────────────
const text = fs.readFileSync(absolutePath, "utf8");
const lines = text.split("\n");
const lineOffsets = buildLineOffsets(text);
const ext = path.extname(absolutePath).toLowerCase();
const langId = ext === ".go" ? "go" : ext === ".py" ? "python" : "typescript";
const docUri = pathToFileURL(absolutePath).href;

const symbolRegex =
  langId === "go"     ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  : langId === "python" ? /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

const symbols: { name: string; range: ReturnType<typeof rangeFromOffsets>; selectionRange: ReturnType<typeof rangeFromOffsets>; children: never[] }[] = [];
const definitionsByName = new Map<string, { uri: string; range: ReturnType<typeof rangeFromOffsets> }>();

let m: RegExpExecArray | null;
while ((m = symbolRegex.exec(text))) {
  const name = m[1];
  const nameOffset = m.index + m[0].indexOf(name);
  const end = findBraceBlockEnd(text, m.index);
  const sym = {
    name,
    range: rangeFromOffsets(m.index, end, lineOffsets),
    selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
    children: [] as never[],
  };
  symbols.push(sym);
  definitionsByName.set(name, { uri: docUri, range: sym.selectionRange });
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

const provider: TokenProvider = {
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

// ── find target symbol ────────────────────────────────────────────────────────
const target = symbols.find(s => s.name === symbolName);
if (!target) {
  const available = symbols.map(s => s.name).join(", ");
  console.error(`Error: symbol "${symbolName}" not found in ${absolutePath}`);
  console.error(`Available: ${available || "(none detected)"}`);
  process.exit(1);
}

// ── get tokens with definitions ───────────────────────────────────────────────
const tokens = await getDecodedTokensFromSymbolWithDefs(document, target, provider);

// filter: only tokens with resolved definitions
const resolved = tokens.filter(t => t.definition && t.definition.length > 0 && t.word && t.word !== symbolName);

if (resolved.length === 0) {
  const relPath = path.relative(process.cwd(), absolutePath) || absolutePath;
  console.log(`Tokens in '${symbolName}' (${relPath}:${target.selectionRange.start.line + 1}:${target.selectionRange.start.character + 1}):`);
  console.log("");
  console.log("  (no resolved definitions — try setting LSPRAG_LSP_PROVIDER for cross-file lookup)");
  process.exit(0);
}

// ── format output ─────────────────────────────────────────────────────────────
const relPath = path.relative(process.cwd(), absolutePath) || absolutePath;
const symLine = target.selectionRange.start.line + 1;
const symCol  = target.selectionRange.start.character + 1;
console.log(`Tokens in '${symbolName}' (${relPath}:${symLine}:${symCol}):`);
console.log("");

// column widths
const maxWord = Math.max(...resolved.map(t => (t.word ?? "").length), 6);

for (const tok of resolved) {
  const word  = (tok.word ?? "").padEnd(maxWord);
  const tLine = String(tok.line + 1).padStart(4);
  const tCol  = String(tok.startChar + 1).padStart(3);
  const def   = tok.definition![0];
  const defFile = def.uri.startsWith("file://") ? new URL(def.uri).pathname : def.uri;
  const defRel  = path.relative(process.cwd(), defFile) || defFile;
  const defLine = def.range.start.line + 1;
  const defCol  = def.range.start.character + 1;
  console.log(`  L${tLine}:C${tCol}  ${word}  ->  ${defRel}:${defLine}:${defCol}`);
}
