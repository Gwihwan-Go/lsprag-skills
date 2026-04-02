#!/usr/bin/env node
/**
 * retrieve-def-cli.ts — find a symbol's definition and print its full source
 *
 * Usage:
 *   lsprag retrieve-def --file <path> --symbol <name[,name2,...]>
 *   lsprag retrieve-def --file <path> --symbol <name> [--symbol <name2> ...]
 *   lsprag retrieve-def --file <path> --location <line>:<col>
 *   lsprag retrieve-def --file <path> --line-range <start:end> [--symbol <name[,name2,...]>]
 *
 * Without --location / --line-range:
 *   Finds symbol definitions by name in the file and prints their source.
 *
 * With --location <line>:<col> (1-indexed, human-friendly):
 *   Finds the definition of the symbol AT that position via getDefinitions,
 *   which may resolve to a different file (if LSPRAG_LSP_PROVIDER is set).
 *   Falls back to regex-based same-file lookup otherwise.
 *
 * With --line-range <start:end> (1-indexed, inclusive):
 *   Scans identifiers in that line range and loads all unique definitions.
 *   Optional --symbol values narrow scan candidates to specific names.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── arg parsing ──────────────────────────────────────────────────────────────
type ParsedArgs = {
  values: Record<string, string[]>;
  flags: Set<string>;
};

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspLocation = { uri: string; range: LspRange };
type LspDocument = { uri: string };
type LocalSymbol = { name: string; range: LspRange; selectionRange: LspRange };
type LineRange = { start: number; end: number };
type WordOccurrence = { word: string; position: LspPosition };
type DefinitionProvider = {
  openDocument: (uri: string) => Promise<LspDocument>;
  getDefinitions: (doc: LspDocument, position: LspPosition) => Promise<LspLocation[]>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string[]> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      if (!values[key]) values[key] = [];
      values[key].push(next);
      i++;
    } else {
      flags.add(key);
    }
  }
  return { values, flags };
}

function getArgValues(parsed: ParsedArgs, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const vals = parsed.values[key];
    if (vals) out.push(...vals);
  }
  return out;
}

function getLastArg(parsed: ParsedArgs, ...keys: string[]): string | undefined {
  for (let i = keys.length - 1; i >= 0; i--) {
    const vals = parsed.values[keys[i]];
    if (vals && vals.length > 0) return vals[vals.length - 1];
  }
  return undefined;
}

function parseSymbolNames(rawValues: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of rawValues) {
    for (const piece of raw.split(",")) {
      const name = piece.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function parseLocation(raw: string | undefined): LspPosition | null {
  if (!raw) return null;
  const m = raw.match(/^(\d+)(?::(\d+))?$/);
  if (!m) return null;
  const line = Number.parseInt(m[1], 10);
  const col = Number.parseInt(m[2] ?? "1", 10);
  if (Number.isNaN(line) || Number.isNaN(col) || line <= 0 || col <= 0) return null;
  return { line: line - 1, character: col - 1 };
}

function parseLineRange(raw: string | undefined): LineRange | null {
  if (!raw) return null;
  const m = raw.match(/^(\d+)\s*[:,-]\s*(\d+)$/);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end <= 0 || start > end) return null;
  return { start, end };
}

function printUsage(): void {
  console.error("Usage:");
  console.error("  retrieve-def-cli.ts --file <path> --symbol <name[,name2,...]>");
  console.error("  retrieve-def-cli.ts --file <path> --symbol <name> [--symbol <name2> ...]");
  console.error("  retrieve-def-cli.ts --file <path> --location <line>:<col>");
  console.error("  retrieve-def-cli.ts --file <path> --line-range <start:end> [--symbol <name[,name2,...]>]");
}

function locationKey(loc: LspLocation): string {
  return `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}:${loc.range.end.line}:${loc.range.end.character}`;
}

function uriToAbsolutePath(uri: string): string {
  if (uri.startsWith("file://")) return path.resolve(fileURLToPath(uri));
  return path.isAbsolute(uri) ? uri : path.resolve(process.cwd(), uri);
}

async function loadProvider(): Promise<DefinitionProvider | null> {
  const providerPath = process.env.LSPRAG_LSP_PROVIDER ?? process.env.LSPRAG_PROVIDER_PATH;
  if (!providerPath) return null;
  try {
    const resolvedProviderPath = path.resolve(providerPath);
    const looksLikeLocalPath =
      providerPath.startsWith("/") ||
      providerPath.startsWith(".") ||
      providerPath.includes("\\") ||
      fs.existsSync(resolvedProviderPath);
    const specifier =
      looksLikeLocalPath
        ? pathToFileURL(resolvedProviderPath).href
        : providerPath;
    const mod = await import(specifier);
    const provider =
      mod.providers?.token ??
      mod.providerBundle?.token ??
      mod.tokenProvider ??
      mod.provider ??
      mod.default ??
      mod;
    if (!provider || typeof provider !== "object") return null;
    if (typeof provider.openDocument !== "function") return null;
    if (typeof provider.getDefinitions !== "function") return null;
    return provider as DefinitionProvider;
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));
const filePath = getLastArg(args, "file", "f");
const symbolNames = parseSymbolNames(getArgValues(args, "symbol", "s"));
const rawLocation = getLastArg(args, "location", "loc");
const rawLineRange = getLastArg(args, "line-range", "lines");
const positionFromArg = parseLocation(rawLocation);
const lineRange = parseLineRange(rawLineRange);

if (args.flags.has("help") || args.flags.has("h")) {
  printUsage();
  process.exit(0);
}

if (!filePath) {
  printUsage();
  process.exit(1);
}

if (rawLocation && !positionFromArg) {
  console.error(`Error: invalid --location "${rawLocation}". Expected <line>:<col> (1-indexed)`);
  process.exit(1);
}

if (rawLineRange && !lineRange) {
  console.error(`Error: invalid --line-range "${rawLineRange}". Expected <start:end>, e.g. 12:40`);
  process.exit(1);
}

if (rawLocation && lineRange) {
  console.error("Error: --location and --line-range cannot be used together.");
  process.exit(1);
}

if (!positionFromArg && !lineRange && symbolNames.length === 0) {
  printUsage();
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

function positionAt(offset: number, lineOffsets: number[]): LspPosition {
  let lo = 0, hi = lineOffsets.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lineOffsets[mid] > offset) hi = mid; else lo = mid + 1;
  }
  const line = Math.max(0, lo - 1);
  return { line, character: offset - lineOffsets[line] };
}

function rangeFromOffsets(s: number, e: number, lineOffsets: number[]): LspRange {
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

function findPythonBlockEnd(text: string, lineOffsets: number[], startIndex: number): number {
  const lines = text.split("\n");
  const startLine = positionAt(startIndex, lineOffsets).line;
  const header = lines[startLine] ?? "";
  const headerIndent = header.match(/^(\s*)/)?.[1].length ?? 0;
  let headerEndLine = startLine;
  for (let line = startLine; line < lines.length; line++) {
    const trimmed = (lines[line] ?? "").trim();
    if (trimmed.endsWith(":")) {
      headerEndLine = line;
      break;
    }
  }
  let endLine = lines.length;
  let foundBody = false;

  for (let line = headerEndLine + 1; line < lines.length; line++) {
    const raw = lines[line] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const indent = raw.match(/^(\s*)/)?.[1].length ?? 0;
    if (!foundBody) {
      if (indent <= headerIndent) {
        endLine = line;
        break;
      }
      foundBody = true;
      continue;
    }
    if (indent <= headerIndent && !trimmed.startsWith("#")) {
      endLine = line;
      break;
    }
  }

  if (endLine >= lines.length) return text.length;
  return lineOffsets[endLine] ?? text.length;
}

// ── build symbols from a file ─────────────────────────────────────────────────
function buildSymbols(src: string, lineOffsets: number[], langId: string) {
  const regex =
    langId === "go" ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : langId === "python" ? /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  const symbols: LocalSymbol[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(src))) {
    const name = m[1];
    const nameOffset = m.index + m[0].indexOf(name);
    const end = langId === "python" ? findPythonBlockEnd(src, lineOffsets, m.index) : findBraceBlockEnd(src, m.index);
    symbols.push({
      name,
      range: rangeFromOffsets(m.index, end, lineOffsets),
      selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
    });
  }
  return symbols;
}

// ── extract source text of a range ───────────────────────────────────────────
function rangeText(src: string, lineOffsets: number[], range: LspRange): string {
  const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
  const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
  return src.slice(s, e).trimEnd();
}

function rangeContains(range: LspRange, position: LspPosition): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character >= range.end.character) return false;
  return true;
}

function getWordAtPosition(lines: string[], position: LspPosition): string {
  const lineText = lines[position.line] ?? "";
  let ws = Math.min(position.character, lineText.length);
  let we = ws;
  while (ws > 0 && /[A-Za-z0-9_]/.test(lineText[ws - 1])) ws--;
  while (we < lineText.length && /[A-Za-z0-9_]/.test(lineText[we])) we++;
  return lineText.slice(ws, we);
}

function collectWordOccurrencesInRange(lines: string[], scanRange: LineRange, filter: Set<string> | null): WordOccurrence[] {
  const out: WordOccurrence[] = [];
  const startLine = Math.max(1, scanRange.start);
  const endLine = Math.min(lines.length, scanRange.end);
  for (let line1 = startLine; line1 <= endLine; line1++) {
    const lineText = lines[line1 - 1] ?? "";
    const re = /[A-Za-z_][A-Za-z0-9_]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lineText))) {
      const word = m[0];
      if (filter && !filter.has(word)) continue;
      out.push({
        word,
        position: { line: line1 - 1, character: m.index },
      });
    }
  }
  return out;
}

function pathForDisplay(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

function printDefinitionFromLocation(loc: LspLocation, fallbackName: string): boolean {
  const defPath = uriToAbsolutePath(loc.uri);
  if (!fs.existsSync(defPath)) return false;

  const defText = fs.readFileSync(defPath, "utf8");
  const defLineOffsets = buildLineOffsets(defText);
  const defLangId = path.extname(defPath).toLowerCase() === ".go" ? "go"
    : path.extname(defPath).toLowerCase() === ".py" ? "python" : "typescript";
  const defSymbols = buildSymbols(defText, defLineOffsets, defLangId);
  const startPos = loc.range.start;
  const containing = defSymbols.find((s) => rangeContains(s.range, startPos))
    ?? defSymbols.find((s) => rangeContains(s.selectionRange, startPos))
    ?? defSymbols.find((s) => s.selectionRange.start.line === startPos.line);
  const relPath = pathForDisplay(defPath);
  const lineNum = startPos.line + 1;
  const colNum = startPos.character + 1;

  if (containing) {
    const src = rangeText(defText, defLineOffsets, containing.range);
    console.log(`# ${containing.name} (${relPath}:${lineNum}:${colNum})`);
    console.log(src);
    return true;
  }

  const srcLines = defText.split("\n");
  const startLine = Math.max(0, startPos.line - 1);
  const endLine = Math.min(srcLines.length, startPos.line + 20);
  console.log(`# ${fallbackName} (${relPath}:${lineNum}:${colNum})`);
  console.log(srcLines.slice(startLine, endLine).join("\n").trimEnd());
  return true;
}

async function resolveDefinitionsAtPosition(
  position: LspPosition,
  word: string,
  provider: DefinitionProvider | null,
  providerDoc: LspDocument | null,
  symbolsByName: Map<string, LocalSymbol>,
  selfUri: string,
  lines: string[],
): Promise<LspLocation[]> {
  if (provider && providerDoc) {
    try {
      const defs = await provider.getDefinitions(providerDoc, position);
      if (defs.length > 0) return defs;
    } catch {
      // fall through to regex lookup
    }
  }

  const token = word || getWordAtPosition(lines, position);
  const sym = symbolsByName.get(token);
  if (!sym) return [];
  return [{ uri: selfUri, range: sym.selectionRange }];
}

// ── load text & symbols ───────────────────────────────────────────────────────
const ext = path.extname(absolutePath).toLowerCase();
const langId = ext === ".go" ? "go" : ext === ".py" ? "python" : "typescript";

const text = fs.readFileSync(absolutePath, "utf8");
const lines = text.split("\n");
const lineOffsets = buildLineOffsets(text);
const symbols = buildSymbols(text, lineOffsets, langId);
const symbolsByName = new Map(symbols.map((s) => [s.name, s]));
const selfUri = pathToFileURL(absolutePath).href;
const provider = await loadProvider();
const providerDoc = provider ? await provider.openDocument(selfUri).catch(() => null) : null;

// ── case 1: --location given → "go-to-definition" ───────────────────────────
if (positionFromArg) {
  const fallbackWord = getWordAtPosition(lines, positionFromArg);
  const fallbackName = symbolNames[0] ?? fallbackWord ?? "symbol";
  const defLocations = await resolveDefinitionsAtPosition(
    positionFromArg,
    fallbackWord,
    provider,
    providerDoc,
    symbolsByName,
    selfUri,
    lines,
  );
  if (defLocations.length === 0) {
    console.error(`No definition found at ${rawLocation}`);
    process.exit(1);
  }

  const seen = new Set<string>();
  let printed = 0;
  for (const loc of defLocations) {
    const key = locationKey(loc);
    if (seen.has(key)) continue;
    seen.add(key);
    if (printed > 0) console.log("");
    if (printDefinitionFromLocation(loc, fallbackName)) printed++;
  }
  if (printed === 0) {
    console.error(`No readable definition found at ${rawLocation}`);
    process.exit(1);
  }
  process.exit(0);
}

// ── case 2: --line-range given → load defs for all symbols in range ──────────
if (lineRange) {
  if (lineRange.start > lines.length) {
    console.error(`Error: --line-range starts after end of file (${lines.length} lines): ${lineRange.start}:${lineRange.end}`);
    process.exit(1);
  }
  const symbolFilter = symbolNames.length > 0 ? new Set(symbolNames) : null;
  const occurrences = collectWordOccurrencesInRange(lines, lineRange, symbolFilter);
  const defLocations: LspLocation[] = [];
  const seenLoc = new Set<string>();
  for (const occurrence of occurrences) {
    const defs = await resolveDefinitionsAtPosition(
      occurrence.position,
      occurrence.word,
      provider,
      providerDoc,
      symbolsByName,
      selfUri,
      lines,
    );
    for (const loc of defs) {
      const key = locationKey(loc);
      if (seenLoc.has(key)) continue;
      seenLoc.add(key);
      defLocations.push(loc);
    }
  }

  if (defLocations.length === 0) {
    const filterNote = symbolNames.length > 0 ? ` (filter: ${symbolNames.join(", ")})` : "";
    console.error(`No definitions found in line range ${lineRange.start}:${lineRange.end}${filterNote}`);
    process.exit(1);
  }

  let printed = 0;
  for (const loc of defLocations) {
    if (printed > 0) console.log("");
    if (printDefinitionFromLocation(loc, "definition")) printed++;
  }
  if (printed === 0) {
    console.error(`No readable definitions found in line range ${lineRange.start}:${lineRange.end}`);
    process.exit(1);
  }
  process.exit(0);
}

// ── case 3: find symbol(s) by name in file ───────────────────────────────────
const missing = symbolNames.filter((name) => !symbolsByName.has(name));
if (missing.length > 0) {
  const available = symbols.map((s) => s.name).join(", ");
  console.error(`Error: symbol(s) not found in ${absolutePath}: ${missing.join(", ")}`);
  console.error(`Available: ${available || "(none detected)"}`);
  process.exit(1);
}

let printed = 0;
for (const symbolName of symbolNames) {
  const target = symbolsByName.get(symbolName);
  if (!target) continue;
  if (printed > 0) console.log("");
  const relPath = pathForDisplay(absolutePath);
  const lineNum = target.selectionRange.start.line + 1;
  const colNum = target.selectionRange.start.character + 1;
  const src = rangeText(text, lineOffsets, target.range);
  console.log(`# ${target.name} (${relPath}:${lineNum}:${colNum})`);
  console.log(src);
  printed++;
}
