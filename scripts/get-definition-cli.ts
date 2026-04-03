#!/usr/bin/env node
/**
 * get-definition-cli.ts — find a symbol's definition and print its full source
 *
 * Usage:
 *   lsprag getDefinition --file <path> --symbol <name>
 *   lsprag getDefinition --file <path> --symbol <name> --location <line>:<col>
 *
 * Symbol routing:
 *   - function / method / class symbols → go-to-definition (prints full body)
 *   - variable / const / property / parameter / enumMember → hover (prints type info)
 *
 * Without --location:
 *   Searches the file by name. Detects whether the symbol is function-type or
 *   variable-type and routes accordingly.
 *
 * With --location <line>:<col> (1-indexed):
 *   Inspects the token type at that position (via semantic tokens if the LSP
 *   provider exposes them, otherwise via text-context heuristics) and routes
 *   to hover or go-to-definition.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Token types for which hover gives better info than go-to-definition
const HOVER_KINDS = new Set([
  "variable",
  "property",
  "parameter",
  "enumMember",
  "enum-member",
]);

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
const filePath    = args["file"] ?? args["f"];
const symbolName  = args["symbol"] ?? args["s"];
const rawLocation = args["location"] ?? args["loc"];

if (!filePath || !symbolName) {
  console.error("Usage: lsprag getDefinition --file <path> --symbol <name> [--location <line>:<col>]");
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

function rangeText(
  src: string,
  lineOffsets: number[],
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
): string {
  const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
  const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
  return src.slice(s, e).trimEnd();
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

// ── symbol types ──────────────────────────────────────────────────────────────
type SymbolKind = "function" | "variable";

interface FileSymbol {
  name: string;
  kind: SymbolKind;
  range: ReturnType<typeof rangeFromOffsets>;
  selectionRange: ReturnType<typeof rangeFromOffsets>;
}

// ── build symbols (function-type + variable-type) ─────────────────────────────
function buildSymbols(src: string, lineOffsets: number[], langId: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];

  // ── function-type symbols ─────────────────────────────────────────────────
  const funcRegex =
    langId === "go"     ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : langId === "python" ? /def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
    : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  let m: RegExpExecArray | null;
  while ((m = funcRegex.exec(src))) {
    const name = m[1];
    const nameOffset = m.index + m[0].indexOf(name);
    const end =
      langId === "python"
        ? src.indexOf("\n", m.index) + 1 || src.length
        : findBraceBlockEnd(src, m.index);
    symbols.push({
      name,
      kind: "function",
      range: rangeFromOffsets(m.index, end, lineOffsets),
      selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
    });
  }

  // ── variable-type symbols (TypeScript / JavaScript) ───────────────────────
  if (langId !== "go" && langId !== "python") {
    // Matches: [export] [const|let|var] <name>
    const varRegex = /(?:^|(?<=\n))[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    while ((m = varRegex.exec(src))) {
      const name = m[1];
      const nameOffset = m.index + m[0].lastIndexOf(name);
      // Range: declaration line only
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const lineEnd   = src.indexOf("\n", m.index);
      const rangeEnd  = lineEnd === -1 ? src.length : lineEnd;
      symbols.push({
        name,
        kind: "variable",
        range: rangeFromOffsets(lineStart, rangeEnd, lineOffsets),
        selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
      });
    }
  }

  // ── variable-type symbols (Go) ────────────────────────────────────────────
  if (langId === "go") {
    const goVarRegex = /(?:^|(?<=\n))[ \t]*var\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((m = goVarRegex.exec(src))) {
      const name = m[1];
      const nameOffset = m.index + m[0].lastIndexOf(name);
      const lineStart = src.lastIndexOf("\n", m.index) + 1;
      const lineEnd   = src.indexOf("\n", m.index);
      const rangeEnd  = lineEnd === -1 ? src.length : lineEnd;
      symbols.push({
        name,
        kind: "variable",
        range: rangeFromOffsets(lineStart, rangeEnd, lineOffsets),
        selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
      });
    }
  }

  return symbols;
}

// ── load file ─────────────────────────────────────────────────────────────────
const ext    = path.extname(absolutePath).toLowerCase();
const langId = ext === ".go" ? "go" : ext === ".py" ? "python" : "typescript";
const text   = fs.readFileSync(absolutePath, "utf8");
const lineOffsets = buildLineOffsets(text);
const symbols     = buildSymbols(text, lineOffsets, langId);

// ── load LSP provider (optional) ─────────────────────────────────────────────
const providerPath = process.env.LSPRAG_LSP_PROVIDER;
let provider: any = null;

if (providerPath) {
  const specifier = providerPath.startsWith("/") || providerPath.startsWith(".")
    ? pathToFileURL(path.resolve(providerPath)).href
    : providerPath;
  const mod = await import(specifier);
  provider = mod.default ?? mod.provider ?? mod;
}

// ── semantic token type lookup ────────────────────────────────────────────────
async function getSemanticTokenTypeAtPosition(
  doc: { uri: string; getText(r?: any): string },
  position: { line: number; character: number }
): Promise<string | null> {
  if (!provider) return null;
  const getTokens  = provider.getSemanticTokens;
  const getLegend  = provider.getSemanticTokensLegend;
  if (typeof getTokens !== "function" || typeof getLegend !== "function") return null;

  const tokens = await getTokens(doc);
  const legend = await getLegend(doc);
  if (!tokens?.data || !legend?.tokenTypes) return null;

  let line = 0, char = 0;
  for (let i = 0; i < tokens.data.length; i += 5) {
    const dl = tokens.data[i];
    const dc = tokens.data[i + 1];
    const len = tokens.data[i + 2];
    const typeIdx = tokens.data[i + 3];
    line += dl;
    char = dl > 0 ? dc : char + dc;
    if (line === position.line && char <= position.character && position.character < char + len) {
      return legend.tokenTypes[typeIdx] ?? null;
    }
    if (line > position.line) break;
  }
  return null;
}

// ── hover call ────────────────────────────────────────────────────────────────
async function callHover(
  doc: { uri: string; getText(r?: any): string },
  position: { line: number; character: number },
  label: string
): Promise<void> {
  if (provider && typeof provider.getHover === "function") {
    const result = await provider.getHover(doc, position);
    if (result) {
      const hoverText = typeof result === "string" ? result
        : result.contents?.value ?? result.contents ?? String(result);
      console.log(`# ${label} [hover]`);
      console.log(hoverText);
      process.exit(0);
    }
  }
  // Fallback: print the declaration line directly
  const lineText = text.split("\n")[position.line] ?? "";
  console.log(`# ${label} [declaration]`);
  console.log(lineText.trim());
  process.exit(0);
}

// ── case 1: --location given → inspect type then route ───────────────────────
if (rawLocation) {
  const [rawLine, rawCol] = rawLocation.split(":");
  const loc1Line = parseInt(rawLine, 10);
  const loc1Col  = parseInt(rawCol ?? "1", 10);
  if (Number.isNaN(loc1Line)) {
    console.error(`Error: invalid --location "${rawLocation}". Expected <line>:<col> (1-indexed)`);
    process.exit(1);
  }
  const position = { line: loc1Line - 1, character: loc1Col - 1 };

  const docUri = pathToFileURL(absolutePath).href;
  const doc = {
    uri: docUri,
    getText(range?: any): string {
      if (!range) return text;
      const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
      const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
      return text.slice(s, e);
    },
  };

  // Determine token kind at position
  const semanticType = await getSemanticTokenTypeAtPosition(doc, position);

  // Text-based fallback for kind detection
  function textKindAtPosition(): SymbolKind {
    const lineText = text.split("\n")[position.line] ?? "";
    const before   = lineText.slice(0, position.character).trimStart();
    if (/\b(const|let|var)\s+\S*$/.test(before)) return "variable";
    if (/\b(function|func|def)\s+\S*$/.test(before)) return "function";
    // Check if at a call site: word followed by (
    let we = position.character;
    while (we < lineText.length && /\w/.test(lineText[we])) we++;
    if (lineText[we] === "(") return "function";
    return "variable";
  }

  const kind: SymbolKind =
    semanticType !== null
      ? (HOVER_KINDS.has(semanticType) ? "variable" : "function")
      : textKindAtPosition();

  const relPath = path.relative(process.cwd(), absolutePath) || absolutePath;
  const label   = `${symbolName} (${relPath}:${loc1Line}:${loc1Col})`;

  if (kind === "variable") {
    await callHover(doc, position, label);
    // callHover always exits
  }

  // kind === "function" → go-to-definition
  let defLocations: Array<{ uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> = [];

  if (provider && typeof provider.getDefinitions === "function") {
    const provDoc = await provider.openDocument(docUri);
    defLocations = await provider.getDefinitions(provDoc, position);
  } else {
    // Regex fallback: find function symbol matching word at position
    const lineText = text.split("\n")[position.line] ?? "";
    let ws = Math.min(position.character, lineText.length);
    let we = ws;
    while (ws > 0 && /[A-Za-z0-9_]/.test(lineText[ws - 1])) ws--;
    while (we < lineText.length && /[A-Za-z0-9_]/.test(lineText[we])) we++;
    const word = lineText.slice(ws, we);
    const sym  = symbols.find(s => s.name === word && s.kind === "function");
    if (sym) {
      defLocations = [{ uri: docUri, range: sym.selectionRange }];
    }
  }

  if (defLocations.length === 0) {
    // Last-resort: try hover even for function-type if goToDefinition found nothing
    await callHover(doc, position, label);
  }

  for (const loc of defLocations.slice(0, 3)) {
    const defPath = loc.uri.startsWith("file://") ? new URL(loc.uri).pathname : loc.uri;
    const defText = fs.readFileSync(defPath, "utf8");
    const defLineOffsets = buildLineOffsets(defText);
    const defLangId =
      path.extname(defPath).toLowerCase() === ".go" ? "go"
      : path.extname(defPath).toLowerCase() === ".py" ? "python"
      : "typescript";
    const defSymbols = buildSymbols(defText, defLineOffsets, defLangId);

    const defLine = loc.range.start.line;
    const containing =
      defSymbols.find(s =>
        s.kind === "function" &&
        s.range.start.line <= defLine && s.range.end.line >= defLine
      ) ??
      defSymbols.find(s => s.selectionRange.start.line === defLine);

    const rel    = path.relative(process.cwd(), defPath) || defPath;
    const lineN  = loc.range.start.line + 1;
    const colN   = loc.range.start.character + 1;

    if (containing) {
      console.log(`# ${containing.name} (${rel}:${lineN}:${colN})`);
      console.log(rangeText(defText, defLineOffsets, containing.range));
    } else {
      const srcLines = defText.split("\n");
      const startLine = Math.max(0, defLine - 1);
      const endLine   = Math.min(srcLines.length, defLine + 20);
      console.log(`# ${symbolName} (${rel}:${lineN}:${colN})`);
      console.log(srcLines.slice(startLine, endLine).join("\n").trimEnd());
    }
  }
  process.exit(0);
}

// ── case 2: find symbol by name ───────────────────────────────────────────────
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

if (target.kind === "variable") {
  const docUri = pathToFileURL(absolutePath).href;
  const doc = {
    uri: docUri,
    getText(range?: any): string {
      if (!range) return text;
      const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
      const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
      return text.slice(s, e);
    },
  };
  await callHover(doc, target.selectionRange.start, `${symbolName} (${relPath}:${lineNum}:${colNum})`);
  // callHover always exits
}

// kind === "function"
const src = rangeText(text, lineOffsets, target.range);
console.log(`# ${target.name} (${relPath}:${lineNum}:${colNum})`);
console.log(src);
