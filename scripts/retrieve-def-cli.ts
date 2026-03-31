#!/usr/bin/env node
/**
 * retrieve-def-cli.ts — find a symbol's definition and print its full source
 *
 * Usage:
 *   lsprag retrieve-def --file <path> --symbol <name>
 *   lsprag retrieve-def --file <path> --symbol <name> --location <line>:<col>
 *
 * Without --location:
 *   Finds the symbol definition by name in the file and prints its source.
 *
 * With --location <line>:<col> (1-indexed, human-friendly):
 *   Finds the definition of the symbol AT that position via getDefinitions,
 *   which may resolve to a different file (if LSPRAG_LSP_PROVIDER is set).
 *   Falls back to regex-based same-file lookup otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
const filePath  = args["file"] ?? args["f"];
const symbolName = args["symbol"] ?? args["s"];
const rawLocation = args["location"] ?? args["loc"];

if (!filePath || !symbolName) {
  console.error("Usage: retrieve-def-cli.ts --file <path> --symbol <name> [--location <line>:<col>]");
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

// ── build symbols from a file ─────────────────────────────────────────────────
function buildSymbols(src: string, lineOffsets: number[], langId: string) {
  const regex =
    langId === "go" ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : langId === "python" ? /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  const symbols: { name: string; range: ReturnType<typeof rangeFromOffsets>; selectionRange: ReturnType<typeof rangeFromOffsets> }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(src))) {
    const name = m[1];
    const nameOffset = m.index + m[0].indexOf(name);
    const end = langId === "python" ? src.indexOf("\n", m.index) + 1 || src.length : findBraceBlockEnd(src, m.index);
    symbols.push({
      name,
      range: rangeFromOffsets(m.index, end, lineOffsets),
      selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
    });
  }
  return symbols;
}

// ── extract source text of a range ───────────────────────────────────────────
function rangeText(src: string, lineOffsets: number[], range: { start: { line: number; character: number }; end: { line: number; character: number } }): string {
  const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
  const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
  return src.slice(s, e).trimEnd();
}

// ── load text & symbols ───────────────────────────────────────────────────────
const ext = path.extname(absolutePath).toLowerCase();
const langId = ext === ".go" ? "go" : ext === ".py" ? "python" : "typescript";

const text = fs.readFileSync(absolutePath, "utf8");
const lineOffsets = buildLineOffsets(text);
const symbols = buildSymbols(text, lineOffsets, langId);

// ── case 1: --location given → "go-to-definition" ───────────────────────────
if (rawLocation) {
  const [rawLine, rawCol] = rawLocation.split(":");
  const loc1Line = parseInt(rawLine, 10);
  const loc1Col  = parseInt(rawCol ?? "1", 10);
  if (Number.isNaN(loc1Line)) {
    console.error(`Error: invalid --location "${rawLocation}". Expected <line>:<col> (1-indexed)`);
    process.exit(1);
  }
  // Convert 1-indexed to 0-indexed
  const position = { line: loc1Line - 1, character: loc1Col - 1 };

  // Load provider (LSPRAG_LSP_PROVIDER or regex fallback)
  let defLocations: Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> = [];

  const providerPath = process.env.LSPRAG_LSP_PROVIDER;
  const skillsRoot = process.env.LSPRAG_SKILLS_ROOT
    ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  if (providerPath) {
    const specifier = providerPath.startsWith("/") || providerPath.startsWith(".")
      ? pathToFileURL(path.resolve(providerPath)).href
      : providerPath;
    const mod = await import(specifier);
    const p = mod.default ?? mod.provider ?? mod;
    const docUri = pathToFileURL(absolutePath).href;
    const doc = await p.openDocument(docUri);
    defLocations = await p.getDefinitions(doc, position);
  } else {
    // Regex fallback: search for function definition matching the word at position
    const lineText = text.split("\n")[position.line] ?? "";
    let ws = Math.min(position.character, lineText.length);
    let we = ws;
    while (ws > 0 && /[A-Za-z0-9_]/.test(lineText[ws - 1])) ws--;
    while (we < lineText.length && /[A-Za-z0-9_]/.test(lineText[we])) we++;
    const word = lineText.slice(ws, we);
    const sym = symbols.find(s => s.name === word);
    if (sym) {
      defLocations = [{ uri: pathToFileURL(absolutePath).href, range: sym.selectionRange }];
    }
  }

  if (defLocations.length === 0) {
    console.error(`No definition found for "${symbolName}" at ${rawLocation}`);
    process.exit(1);
  }

  for (const loc of defLocations.slice(0, 3)) {
    const defPath = loc.uri.startsWith("file://")
      ? new URL(loc.uri).pathname
      : loc.uri;
    const defText = fs.readFileSync(defPath, "utf8");
    const defLineOffsets = buildLineOffsets(defText);
    const defLangId = path.extname(defPath).toLowerCase() === ".go" ? "go"
      : path.extname(defPath).toLowerCase() === ".py" ? "python" : "typescript";
    const defSymbols = buildSymbols(defText, defLineOffsets, defLangId);

    // find the symbol that contains or starts at the definition range
    const defLine = loc.range.start.line;
    const containing = defSymbols.find(s =>
      s.range.start.line <= defLine && s.range.end.line >= defLine
    ) ?? defSymbols.find(s => s.selectionRange.start.line === defLine);

    const relPath = path.relative(process.cwd(), defPath) || defPath;
    const lineNum = loc.range.start.line + 1;
    const colNum  = loc.range.start.character + 1;

    if (containing) {
      const src = rangeText(defText, defLineOffsets, containing.range);
      console.log(`# ${containing.name} (${relPath}:${lineNum}:${colNum})`);
      console.log(src);
    } else {
      // fallback: print a window of lines around the definition
      const srcLines = defText.split("\n");
      const startLine = Math.max(0, defLine - 1);
      const endLine   = Math.min(srcLines.length, defLine + 20);
      console.log(`# ${symbolName} (${relPath}:${lineNum}:${colNum})`);
      console.log(srcLines.slice(startLine, endLine).join("\n").trimEnd());
    }
  }
  process.exit(0);
}

// ── case 2: find symbol by name in file ──────────────────────────────────────
const target = symbols.find(s => s.name === symbolName);
if (!target) {
  const available = symbols.map(s => s.name).join(", ");
  console.error(`Error: symbol "${symbolName}" not found in ${absolutePath}`);
  console.error(`Available: ${available || "(none detected)"}`);
  process.exit(1);
}

const relPath = path.relative(process.cwd(), absolutePath) || absolutePath;
const lineNum = target.selectionRange.start.line + 1;
const colNum  = target.selectionRange.start.character + 1;
const src = rangeText(text, lineOffsets, target.range);

console.log(`# ${target.name} (${relPath}:${lineNum}:${colNum})`);
console.log(src);
