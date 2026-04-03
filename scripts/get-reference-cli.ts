#!/usr/bin/env node
/**
 * get-reference-cli.ts — find all callers/usages of a symbol
 *
 * Usage:
 *   lsprag getReference --file <path> --symbol <name>
 *   lsprag getReference --file <path> --symbol <name> --location <line>:<col>
 *   lsprag getReference --file <path> --symbol <name> --window <lines>
 *
 * Requires LSPRAG_LSP_PROVIDER to be set — no regex fallback.
 * The provider must expose:
 *   getReferences(document, position): Promise<Location[]>
 *   openDocument(uri): Promise<Document>
 *   getSymbols(uri): Promise<Symbol[]>
 *
 * Without --location:
 *   Resolves the symbol by name via provider.getSymbols(), then calls getReferences
 *   at the symbol's selection-range start.
 *
 * With --location <line>:<col> (1-indexed):
 *   Calls getReferences at that position directly.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getReferenceInfo } from "../src/referenceCore.js";
import type { ReferenceProvider, ReferenceDocument } from "../src/referenceCore.js";

// ── require LSP provider ───────────────────────────────────────────────────────
const providerPath = process.env.LSPRAG_LSP_PROVIDER;
if (!providerPath) {
  console.error("Error: getReference requires a real LSP provider.");
  console.error("Set LSPRAG_LSP_PROVIDER to the path of your provider module.");
  console.error("Example: export LSPRAG_LSP_PROVIDER=/path/to/lsp-provider.js");
  process.exit(1);
}

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
const rawWindow   = args["window"] ?? args["w"];

if (!filePath || !symbolName) {
  console.error("Usage: lsprag getReference --file <path> --symbol <name> [--location <line>:<col>] [--window <lines>]");
  process.exit(1);
}

const absolutePath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), filePath);

const refWindow = rawWindow ? parseInt(rawWindow, 10) : 60;
if (Number.isNaN(refWindow) || refWindow < 0) {
  console.error(`Error: invalid --window value "${rawWindow}". Expected a non-negative integer.`);
  process.exit(1);
}

// ── load provider ─────────────────────────────────────────────────────────────
const specifier = providerPath.startsWith("/") || providerPath.startsWith(".")
  ? pathToFileURL(path.resolve(providerPath)).href
  : providerPath;

let rawMod: any;
try {
  rawMod = await import(specifier);
} catch (err) {
  console.error(`Error: failed to load LSPRAG_LSP_PROVIDER from "${providerPath}"`);
  console.error(String(err));
  process.exit(1);
}

// Normalise module shape: support { providers }, { referenceProvider }, { default }, etc.
function extractProvider(mod: any): ReferenceProvider {
  const bundle = mod.providers ?? mod.providerBundle ?? null;
  if (bundle?.reference) return bundle.reference;

  const fallback = mod.referenceProvider ?? mod.provider ?? mod.default ?? mod;
  if (typeof fallback?.getReferences === "function") return fallback;

  console.error("Error: the loaded provider does not expose a getReferences method.");
  console.error("Make sure your provider exports { getReferences, openDocument, getSymbols }.");
  process.exit(1);
}

const provider: ReferenceProvider = extractProvider(rawMod);

// ── open document ─────────────────────────────────────────────────────────────
const docUri = pathToFileURL(absolutePath).href;

let document: ReferenceDocument;
try {
  document = await provider.openDocument(docUri);
} catch (err) {
  console.error(`Error: provider failed to open "${absolutePath}"`);
  console.error(String(err));
  process.exit(1);
}

// ── resolve position ──────────────────────────────────────────────────────────
let position: { line: number; character: number };

if (rawLocation) {
  const [rawLine, rawCol] = rawLocation.split(":");
  const loc1Line = parseInt(rawLine, 10);
  const loc1Col  = parseInt(rawCol ?? "1", 10);
  if (Number.isNaN(loc1Line)) {
    console.error(`Error: invalid --location "${rawLocation}". Expected <line>:<col> (1-indexed)`);
    process.exit(1);
  }
  position = { line: loc1Line - 1, character: loc1Col - 1 };
} else {
  // Find symbol by name using provider.getSymbols
  let symbols: any[];
  try {
    symbols = await provider.getSymbols(docUri);
  } catch (err) {
    console.error(`Error: provider failed to retrieve symbols from "${absolutePath}"`);
    console.error(String(err));
    process.exit(1);
  }

  const target = symbols.find((s: any) => s.name === symbolName);
  if (!target) {
    const available = symbols.map((s: any) => s.name).join(", ");
    console.error(`Error: symbol "${symbolName}" not found in ${absolutePath}`);
    console.error(`Available: ${available || "(none detected)"}`);
    process.exit(1);
  }
  position = target.selectionRange?.start ?? target.range.start;
}

// ── build range from position (single-token range) ───────────────────────────
const range = { start: position, end: position };

// ── get references ────────────────────────────────────────────────────────────
const relPath = path.relative(process.cwd(), absolutePath) || absolutePath;
const lineNum = position.line + 1;
const colNum  = position.character + 1;

const result = await getReferenceInfo(document, range, provider, { refWindow });

if (!result || result.trim() === "") {
  console.log(`References to '${symbolName}' (${relPath}:${lineNum}:${colNum}):`);
  console.log("");
  console.log("  (no references found)");
  process.exit(0);
}

console.log(`References to '${symbolName}' (${relPath}:${lineNum}:${colNum}):`);
console.log("");
console.log(result);
