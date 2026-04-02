#!/usr/bin/env node
/**
 * token-defs-cli.ts — LSP-only token dependency analysis.
 *
 * Usage:
 *   lsprag token-defs --file <path> --symbol <name> [--full-source] [--format plain|markdown]
 *   lsprag token-analysis --file <path> --symbol <name> [--line-range <start:end>]
 *
 * Notes:
 * - This command requires an LSP-backed provider via LSPRAG_LSP_PROVIDER (or LSPRAG_PROVIDER_PATH).
 * - Non-LSP local fallback providers are intentionally unsupported.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getDecodedTokensFromSymbolWithDefs } from "../src/tokenDefsCore.js";
import { flattenSymbols } from "../src/symbolCore.js";
import { rangeContains } from "../src/coreTypes.js";
import type {
  CoreDecodedToken,
  LspDocument,
  LspLocation,
  LspRange,
  LspSymbol,
} from "../src/coreTypes.js";
import type { TokenProvider } from "../src/tokenCore.js";

type ParsedArgs = {
  values: Record<string, string>;
  flags: Set<string>;
};

type FormatMode = "plain" | "markdown";

type LineRange = {
  start: number; // 1-indexed inclusive
  end: number; // 1-indexed inclusive
};

type DefinitionRecord = {
  key: string;
  tokenWord: string;
  tokenLine1: number;
  tokenCol1: number;
  tokenRelPath: string;
  tokenAbsPath: string;
  defRelPath: string;
  defAbsPath: string;
  defLine1: number;
  defCol1: number;
  symbolName: string;
  symbolType: string;
  symbolLineCount: number;
  source: string;
};

type MarkerRow = DefinitionRecord & { marker: string };

type ResolvedProvider = {
  provider: TokenProvider;
  providerPath: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i++;
    } else {
      flags.add(key);
    }
  }
  return { values, flags };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isDigits(raw: string): boolean {
  if (!raw) return false;
  for (const ch of raw) {
    if (ch < "0" || ch > "9") return false;
  }
  return true;
}

function parseLineRange(raw: string | undefined): LineRange | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let sepIndex = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === ":" || ch === "," || ch === "-") {
      sepIndex = i;
      break;
    }
  }
  if (sepIndex <= 0 || sepIndex >= trimmed.length - 1) return null;
  const left = trimmed.slice(0, sepIndex).trim();
  const right = trimmed.slice(sepIndex + 1).trim();
  if (!isDigits(left) || !isDigits(right)) return null;
  const start = Number.parseInt(left, 10);
  const end = Number.parseInt(right, 10);
  if (Number.isNaN(start) || Number.isNaN(end) || start <= 0 || end <= 0 || start > end) return null;
  return { start, end };
}

function uriToAbsolutePath(uri: string): string {
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  return path.isAbsolute(uri) ? uri : path.resolve(process.cwd(), uri);
}

function pathForDisplay(filePath: string): string {
  const rel = path.relative(process.cwd(), filePath);
  return rel || filePath;
}

function toFileLink(filePath: string, line1: number, col1: number): string {
  const normalized = filePath.split("\\").join("/");
  return `file://${normalized}:${line1}:${col1}`;
}

function escapeInlineCode(s: string): string {
  return s.split("`").join("\\`");
}

function truncateByLines(src: string, maxLines: number): string {
  if (maxLines <= 0) return src;
  const lines = src.split("\n");
  if (lines.length <= maxLines) return src;
  const head = lines.slice(0, maxLines).join("\n");
  return `${head}\n# ... truncated (${lines.length - maxLines} lines omitted)`;
}

function languageFenceFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".go") return "go";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  return "";
}

const LSP_SYMBOL_KIND: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

function symbolKindToName(kind: number | undefined): string {
  if (kind === undefined || kind === null) return "Unknown";
  return LSP_SYMBOL_KIND[kind] ?? `Unknown(${kind})`;
}

function isTokenProvider(value: unknown): value is TokenProvider {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TokenProvider>;
  return (
    typeof candidate.openDocument === "function" &&
    typeof candidate.getDocumentSymbols === "function" &&
    typeof candidate.getDefinitions === "function"
  );
}

function normalizeProvider(value: TokenProvider): TokenProvider {
  return {
    ...value,
    getSemanticTokensRange: value.getSemanticTokensRange ?? (async () => null),
    getSemanticTokensLegendRange: value.getSemanticTokensLegendRange ?? (async () => null),
    getSemanticTokens: value.getSemanticTokens ?? (async () => null),
    getSemanticTokensLegend: value.getSemanticTokensLegend ?? (async () => ({ tokenTypes: ["symbol"], tokenModifiers: [] })),
  };
}

function printLspUnavailablePrompt(filePath: string, symbolName: string, reason: string, lineRange: LineRange | null): void {
  console.error("[LSP Required] token-defs/token-analysis is LSP-only.");
  console.error("");
  console.error(`Reason: ${reason}`);
  console.error("");
  console.error("Requirements:");
  console.error("1. Set `LSPRAG_LSP_PROVIDER` (or `LSPRAG_PROVIDER_PATH`) to a valid LSP-backed provider module.");
  console.error("2. Provider must implement: openDocument, getDocumentSymbols, getDefinitions.");
  console.error("3. Provider should include native LSP SymbolKind in `symbol.kind`.");
  console.error("");
  console.error("When LSP is unavailable, use default agent shell tools instead:");
  console.error(`  ls -la "${path.dirname(filePath)}"`);
  console.error(`  rg -n "^(function|func|def)\\\\s+" "${filePath}"`);
  console.error(`  rg -nF "${symbolName}" "${filePath}"`);
  if (lineRange) {
    console.error(`  # Requested line range: ${lineRange.start}:${lineRange.end}`);
  }
}

async function loadProviderStrict(): Promise<ResolvedProvider> {
  const providerPath = process.env.LSPRAG_LSP_PROVIDER ?? process.env.LSPRAG_PROVIDER_PATH;
  if (!providerPath) {
    throw new Error("No LSP provider configured (`LSPRAG_LSP_PROVIDER` / `LSPRAG_PROVIDER_PATH` is unset).");
  }
  if (providerPath.toLowerCase().includes("regex-provider")) {
    throw new Error(`Configured provider '${providerPath}' is not supported for LSP-only token analysis.`);
  }

  const resolvedProviderPath = path.resolve(providerPath);
  const looksLikeLocalPath =
    providerPath.startsWith("/") ||
    providerPath.startsWith(".") ||
    providerPath.includes("\\") ||
    fs.existsSync(resolvedProviderPath);
  const specifier = looksLikeLocalPath
    ? pathToFileURL(resolvedProviderPath).href
    : providerPath;
  const mod = await import(specifier);
  const candidate =
    mod.providers?.token ??
    mod.providerBundle?.token ??
    mod.tokenProvider ??
    mod.provider ??
    mod.default ??
    mod;

  if (!isTokenProvider(candidate)) {
    throw new Error(`Provider '${providerPath}' is missing required TokenProvider methods.`);
  }

  return { provider: normalizeProvider(candidate), providerPath };
}

function buildMarkerRows(records: DefinitionRecord[]): MarkerRow[] {
  const seen = new Set<string>();
  const rows: MarkerRow[] = [];
  for (const rec of records) {
    const key = `${rec.tokenLine1}:${rec.tokenCol1}:${rec.defAbsPath}:${rec.defLine1}:${rec.defCol1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...rec, marker: `T${rows.length + 1}` });
  }
  return rows;
}

function markSourceWithResolvedTokens(source: string, symbolStartLine1: number, markerRows: MarkerRow[]): string {
  const lines = source.split("\n");
  const byLine = new Map<number, Array<{ start: number; end: number; text: string }>>();

  for (const row of markerRows) {
    const relLine = row.tokenLine1 - symbolStartLine1;
    if (relLine < 0 || relLine >= lines.length) continue;
    const start = Math.max(0, row.tokenCol1 - 1);
    const end = start + row.tokenWord.length;
    const text = `<<${row.marker}:${row.tokenWord}>>`;
    if (!byLine.has(relLine)) byLine.set(relLine, []);
    byLine.get(relLine)!.push({ start, end, text });
  }

  for (const [lineIdx, replacements] of byLine.entries()) {
    let line = lines[lineIdx] ?? "";
    replacements
      .sort((a, b) => b.start - a.start)
      .forEach((rep) => {
        if (rep.start > line.length) return;
        const boundedEnd = Math.min(line.length, rep.end);
        line = line.slice(0, rep.start) + rep.text + line.slice(boundedEnd);
      });
    lines[lineIdx] = line;
  }

  return lines.join("\n");
}

async function resolveDefinitionRecord(
  token: CoreDecodedToken,
  rootPath: string,
  provider: TokenProvider,
  maxSourceLines: number,
): Promise<DefinitionRecord | null> {
  if (!token.definition || token.definition.length === 0) return null;
  const def = token.definition[0] as LspLocation;
  const defAbsPath = path.resolve(uriToAbsolutePath(def.uri));
  if (!fs.existsSync(defAbsPath)) return null;

  const tokenLine1 = token.line + 1;
  const tokenCol1 = token.startChar + 1;
  const defLine1 = def.range.start.line + 1;
  const defCol1 = def.range.start.character + 1;

  let symbolName = token.word;
  let symbolType = "Unknown";
  let symbolLineCount = 1;
  let source = "";

  try {
    const defUri = pathToFileURL(defAbsPath).href;
    const defDocument = await provider.openDocument(defUri);
    const rawSymbols = await provider.getDocumentSymbols(defUri);
    const symbols = flattenSymbols(rawSymbols);
    const containing =
      symbols.find((sym) => rangeContains(sym.range, def.range.start)) ??
      symbols.find((sym) => sym.selectionRange && rangeContains(sym.selectionRange, def.range.start)) ??
      symbols.find((sym) => {
        const r = sym.selectionRange ?? sym.range;
        return r.start.line === def.range.start.line;
      });

    if (containing) {
      symbolName = containing.name;
      symbolType = symbolKindToName(containing.kind);
      symbolLineCount = Math.max(1, containing.range.end.line - containing.range.start.line + 1);
      source = defDocument.getText(containing.range).trimEnd();
    }
  } catch {
    // Continue to source-window fallback below.
  }

  if (!source) {
    const text = fs.readFileSync(defAbsPath, "utf8");
    const lines = text.split("\n");
    const startLine = Math.max(0, def.range.start.line - 1);
    const endLine = Math.min(lines.length, startLine + Math.max(maxSourceLines, 20));
    source = lines.slice(startLine, endLine).join("\n").trimEnd();
    symbolLineCount = Math.max(1, endLine - startLine);
  }

  source = truncateByLines(source, maxSourceLines);
  const tokenAbsPath = path.resolve(rootPath);
  const tokenRelPath = pathForDisplay(tokenAbsPath);
  const defRelPath = pathForDisplay(defAbsPath);
  const key = `${defAbsPath}:${defLine1}:${defCol1}`;

  return {
    key,
    tokenWord: token.word,
    tokenLine1,
    tokenCol1,
    tokenRelPath,
    tokenAbsPath,
    defRelPath,
    defAbsPath,
    defLine1,
    defCol1,
    symbolName,
    symbolType,
    symbolLineCount,
    source,
  };
}

function printPlainSummary(symbolName: string, rootPath: string, target: LspSymbol, resolvedTokens: CoreDecodedToken[]): void {
  const relPath = pathForDisplay(rootPath);
  const symLine = target.selectionRange?.start.line ?? target.range.start.line;
  const symCol = target.selectionRange?.start.character ?? target.range.start.character;
  console.log(`Tokens in '${symbolName}' (${relPath}:${symLine + 1}:${symCol + 1}):`);
  console.log("");

  const maxWord = Math.max(...resolvedTokens.map((t) => t.word.length), 6);
  for (const tok of resolvedTokens) {
    const def = tok.definition[0];
    const defFileAbs = path.resolve(uriToAbsolutePath(def.uri));
    const defRel = pathForDisplay(defFileAbs);
    const word = tok.word.padEnd(maxWord);
    const tLine = String(tok.line + 1).padStart(4);
    const tCol = String(tok.startChar + 1).padStart(3);
    const defLine = def.range.start.line + 1;
    const defCol = def.range.start.character + 1;
    console.log(`  L${tLine}:C${tCol}  ${word}  ->  ${defRel}:${defLine}:${defCol}`);
  }
}

function printMarkdownSummary(symbolName: string, rootPath: string, target: LspSymbol, records: DefinitionRecord[]): void {
  const relPath = pathForDisplay(rootPath);
  const symLine = (target.selectionRange?.start.line ?? target.range.start.line) + 1;
  const symCol = (target.selectionRange?.start.character ?? target.range.start.character) + 1;
  const rootLink = toFileLink(rootPath, symLine, symCol);
  console.log(`# Token Analysis: \`${escapeInlineCode(symbolName)}\``);
  console.log("");
  console.log(`Root symbol: [${relPath}:${symLine}:${symCol}](${rootLink})`);
  console.log("");
  console.log("| Token | Token Location | Definition |");
  console.log("| --- | --- | --- |");
  for (const rec of records) {
    const tokenLink = toFileLink(rec.tokenAbsPath, rec.tokenLine1, rec.tokenCol1);
    const defLink = toFileLink(rec.defAbsPath, rec.defLine1, rec.defCol1);
    console.log(
      `| \`${escapeInlineCode(rec.tokenWord)}\` | [${rec.tokenRelPath}:${rec.tokenLine1}:${rec.tokenCol1}](${tokenLink}) | [${rec.defRelPath}:${rec.defLine1}:${rec.defCol1}](${defLink}) |`,
    );
  }
}

function printDefinitionSources(records: DefinitionRecord[], format: FormatMode): void {
  const byKey = new Map<string, DefinitionRecord>();
  for (const record of records) {
    if (!byKey.has(record.key)) byKey.set(record.key, record);
  }

  if (byKey.size === 0) return;
  if (format === "markdown") {
    console.log("");
    console.log("## Definition Sources");
  } else {
    console.log("");
    console.log("Resolved definition sources:");
  }

  for (const record of byKey.values()) {
    const link = toFileLink(record.defAbsPath, record.defLine1, record.defCol1);
    if (format === "markdown") {
      console.log("");
      console.log(`### \`${escapeInlineCode(record.symbolName)}\` ([${record.defRelPath}:${record.defLine1}:${record.defCol1}](${link}))`);
      console.log("");
      console.log(`\`\`\`${languageFenceFromPath(record.defAbsPath)}`);
      console.log(record.source);
      console.log("```");
    } else {
      console.log("");
      console.log(`# ${record.symbolName} (${record.defRelPath}:${record.defLine1}:${record.defCol1})`);
      console.log(record.source);
    }
  }
}

function printAnalysisModeOutput(
  symbolName: string,
  rootPath: string,
  target: LspSymbol,
  document: LspDocument,
  records: DefinitionRecord[],
  lineRange: LineRange | null,
): void {
  const relPath = pathForDisplay(rootPath);
  const symLine = (target.selectionRange?.start.line ?? target.range.start.line) + 1;
  const symCol = (target.selectionRange?.start.character ?? target.range.start.character) + 1;
  const rootLink = toFileLink(rootPath, symLine, symCol);
  const symbolSource = document.getText(target.range).trimEnd();
  const markerRows = buildMarkerRows(records);
  const markedSource = markSourceWithResolvedTokens(symbolSource, target.range.start.line + 1, markerRows);

  console.log(`# Token Analysis: \`${escapeInlineCode(symbolName)}\``);
  console.log("");
  console.log(`Root symbol: [${relPath}:${symLine}:${symCol}](${rootLink})`);
  if (lineRange) {
    console.log(`Line filter: \`${lineRange.start}:${lineRange.end}\` (applied to token rows)`);
  }
  console.log("");
  console.log("Marker legend: `<<Tn:token>>` means token with resolved symbol definition.");
  console.log("");
  console.log(`\`\`\`${languageFenceFromPath(rootPath)}`);
  console.log(markedSource);
  console.log("```");
  console.log("");
  console.log("| Token | Symbol Type | Lines of Symbols | skill call instruction (lsprag retrieve-def) |");
  console.log("| --- | --- | --- | --- |");
  for (const row of markerRows) {
    const retrieveCmd = `lsprag retrieve-def --file "${row.defAbsPath}" --symbol ${row.symbolName}`;
    console.log(
      `| \`${row.marker}:${escapeInlineCode(row.tokenWord)}\` | \`${escapeInlineCode(row.symbolType)}\` | \`${row.symbolLineCount}\` | \`${escapeInlineCode(retrieveCmd)}\` |`,
    );
  }

  console.log("");
  console.log("## Agent Instructions");
  console.log("1. If needed, inspect repository context with shell tools:");
  console.log(`   \`ls -la "${path.dirname(rootPath)}"\``);
  console.log("2. Search symbol mentions in the current file:");
  console.log(`   \`rg -nF "${escapeInlineCode(symbolName)}" "${rootPath}"\``);
  console.log("3. Jump to one symbol definition:");
  console.log(`   \`lsprag retrieve-def --file "${rootPath}" --symbol <symbol_name>\``);
  console.log("4. Recursive skill call on a discovered dependency symbol:");
  console.log("   `lsprag token-analysis --file <definition_file> --symbol <dependency_symbol>`");
  console.log("5. Optional scope narrowing while keeping the same symbol:");
  console.log("   `--line-range <start:end>`");
}

const parsed = parseArgs(process.argv.slice(2));
const filePath = parsed.values["file"] ?? parsed.values["f"];
const symbolName = parsed.values["symbol"] ?? parsed.values["s"];

if (!filePath || !symbolName) {
  console.error(
    "Usage: token-defs-cli.ts --file <path> --symbol <name> [--full-source] [--format plain|markdown] [--max-source-lines <n>] [--line-range <start:end>] [--analysis]",
  );
  process.exit(1);
}

const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
if (!fs.existsSync(absolutePath)) {
  console.error(`Error: file not found: ${absolutePath}`);
  process.exit(1);
}

const formatRaw = (parsed.values["format"] ?? (parsed.flags.has("markdown") ? "markdown" : "plain")).toLowerCase();
const format: FormatMode = formatRaw === "markdown" ? "markdown" : "plain";
const analysisMode = parsed.flags.has("analysis") || (parsed.values["mode"] ?? "").toLowerCase() === "analysis";
const fullSourceValue = parsed.values["full-source"] ?? parsed.values["with-source"];
const withSource =
  parsed.flags.has("full-source") ||
  parsed.flags.has("with-source") ||
  parsed.flags.has("analysis") ||
  fullSourceValue === "1" ||
  fullSourceValue === "true";
const maxSourceLines = parsePositiveInt(parsed.values["max-source-lines"] ?? parsed.values["max-lines"], 400);
const lineRangeRaw = parsed.values["line-range"] ?? parsed.values["lines"];
const lineRange = parseLineRange(lineRangeRaw);
if (lineRangeRaw && !lineRange) {
  console.error(`Error: invalid --line-range "${lineRangeRaw}". Expected format <start:end>, e.g. 140:190`);
  process.exit(1);
}

let provider: TokenProvider;
let providerPath = "";
try {
  const loaded = await loadProviderStrict();
  provider = loaded.provider;
  providerPath = loaded.providerPath;
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  printLspUnavailablePrompt(absolutePath, symbolName, reason, lineRange);
  process.exit(2);
}

const rootUri = pathToFileURL(absolutePath).href;
let document: LspDocument;
let symbols: LspSymbol[];
try {
  document = await provider.openDocument(rootUri);
  symbols = flattenSymbols(await provider.getDocumentSymbols(rootUri));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  printLspUnavailablePrompt(
    absolutePath,
    symbolName,
    `Provider '${providerPath}' failed to open document or symbols: ${reason}`,
    lineRange,
  );
  process.exit(2);
}

const target = symbols.find((s) => s.name === symbolName);
if (!target) {
  const available = symbols.map((s) => s.name).join(", ");
  console.error(`Error: symbol "${symbolName}" not found in ${absolutePath}`);
  console.error(`Available: ${available || "(none detected)"}`);
  process.exit(1);
}

const tokens = await getDecodedTokensFromSymbolWithDefs(document, target, provider);
const resolvedTokens = tokens.filter((t) => t.definition && t.definition.length > 0 && t.word && t.word !== symbolName);
const scopedResolvedTokens = lineRange
  ? resolvedTokens.filter((t) => t.line + 1 >= lineRange.start && t.line + 1 <= lineRange.end)
  : resolvedTokens;

if (analysisMode) {
  const records: DefinitionRecord[] = [];
  for (const tok of scopedResolvedTokens) {
    const record = await resolveDefinitionRecord(tok, absolutePath, provider, maxSourceLines);
    if (record) records.push(record);
  }
  printAnalysisModeOutput(symbolName, absolutePath, target, document, records, lineRange);
  process.exit(0);
}

if (scopedResolvedTokens.length === 0) {
  const relPath = pathForDisplay(absolutePath);
  const symLine = (target.selectionRange?.start.line ?? target.range.start.line) + 1;
  const symCol = (target.selectionRange?.start.character ?? target.range.start.character) + 1;
  const rangeNote = lineRange ? ` in line range ${lineRange.start}:${lineRange.end}` : "";
  if (format === "markdown") {
    const rootLink = toFileLink(absolutePath, symLine, symCol);
    console.log(`# Token Analysis: \`${escapeInlineCode(symbolName)}\``);
    console.log("");
    console.log(`Root symbol: [${relPath}:${symLine}:${symCol}](${rootLink})`);
    console.log("");
    console.log(`_No resolved definitions${rangeNote}. If LSP quality is insufficient, use shell tools (rg/ls) for manual tracing._`);
  } else {
    console.log(`Tokens in '${symbolName}' (${relPath}:${symLine}:${symCol}):`);
    console.log("");
    console.log(`  (no resolved definitions${rangeNote} — use rg/ls for manual tracing)`);
  }
  process.exit(0);
}

if (format === "plain") {
  printPlainSummary(symbolName, absolutePath, target, scopedResolvedTokens);
} else {
  const recordsForTable: DefinitionRecord[] = [];
  for (const tok of scopedResolvedTokens) {
    const record = await resolveDefinitionRecord(tok, absolutePath, provider, maxSourceLines);
    if (record) recordsForTable.push(record);
  }
  printMarkdownSummary(symbolName, absolutePath, target, recordsForTable);
  if (withSource) {
    printDefinitionSources(recordsForTable, "markdown");
  }
  process.exit(0);
}

if (withSource) {
  const records: DefinitionRecord[] = [];
  for (const tok of scopedResolvedTokens) {
    const record = await resolveDefinitionRecord(tok, absolutePath, provider, maxSourceLines);
    if (record) records.push(record);
  }
  printDefinitionSources(records, "plain");
}
