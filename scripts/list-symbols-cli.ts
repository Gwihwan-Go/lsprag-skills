#!/usr/bin/env node
/**
 * list-symbols-cli.ts — list all functions, classes, and other symbols in a file
 *
 * Usage:
 *   lsprag listSymbols --file <path>
 *
 * Requires LSPRAG_LSP_PROVIDER to be set.
 * The provider must expose:
 *   getDocumentSymbols(uri): Promise<Symbol[]>
 *   openDocument(uri): Promise<Document>
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

// LSP SymbolKind enum (from the LSP spec)
const SymbolKindName: Record<number, string> = {
  1: "File", 2: "Module", 3: "Namespace", 4: "Package",
  5: "Class", 6: "Method", 7: "Property", 8: "Field",
  9: "Constructor", 10: "Enum", 11: "Interface", 12: "Function",
  13: "Variable", 14: "Constant", 15: "String", 16: "Number",
  17: "Boolean", 18: "Array", 19: "Object", 20: "Key",
  21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event",
  25: "Operator", 26: "TypeParameter",
};

// ── require LSP provider ────────────────────────────────────────────────────
const providerPath = process.env.LSPRAG_LSP_PROVIDER;
if (!providerPath) {
  console.error("Error: listSymbols requires a real LSP provider.");
  console.error("Set LSPRAG_LSP_PROVIDER to the path of your provider module.");
  process.exit(1);
}

// ── arg parsing ─────────────────────────────────────────────────────────────
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
const filePath = args["file"] ?? args["f"];

if (!filePath) {
  console.error("Usage: lsprag listSymbols --file <path>");
  process.exit(1);
}

const absolutePath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), filePath);

// ── load provider ───────────────────────────────────────────────────────────
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

const getDocumentSymbols =
  rawMod.getDocumentSymbols ??
  rawMod.provider?.getDocumentSymbols ??
  rawMod.providers?.token?.getDocumentSymbols ??
  rawMod.default?.getDocumentSymbols;

const openDocument =
  rawMod.openDocument ??
  rawMod.provider?.openDocument ??
  rawMod.providers?.token?.openDocument ??
  rawMod.default?.openDocument;

if (!getDocumentSymbols) {
  console.error("Error: the loaded provider does not expose getDocumentSymbols.");
  process.exit(1);
}

// ── list symbols ────────────────────────────────────────────────────────────
const docUri = pathToFileURL(absolutePath).href;

if (openDocument) {
  try { await openDocument(docUri); } catch { /* best effort */ }
}

let symbols: any[];
try {
  symbols = await getDocumentSymbols(docUri);
} catch (err) {
  console.error(`Error: failed to get symbols from "${absolutePath}"`);
  console.error(String(err));
  process.exit(1);
}

if (!symbols || symbols.length === 0) {
  const rel = path.relative(process.cwd(), absolutePath) || absolutePath;
  console.log(`No symbols found in ${rel}`);
  process.exit(0);
}

const rel = path.relative(process.cwd(), absolutePath) || absolutePath;
console.log(`Symbols in ${rel}:`);
console.log();

// Group by kind
const groups = new Map<string, any[]>();
for (const sym of symbols) {
  const kindName = SymbolKindName[sym.kind] ?? `Kind(${sym.kind})`;
  if (!groups.has(kindName)) groups.set(kindName, []);
  groups.get(kindName)!.push(sym);
}

// Print order: Classes, Interfaces, Functions, Methods, then rest
const order = ["Class", "Interface", "Struct", "Enum", "Function", "Method", "Variable", "Constant", "Property", "Field"];
const printed = new Set<string>();

for (const kind of order) {
  const syms = groups.get(kind);
  if (!syms) continue;
  printed.add(kind);
  console.log(`${kind}s:`);
  for (const s of syms) {
    const startLine = (s.range?.start?.line ?? 0) + 1;
    const endLine = (s.range?.end?.line ?? 0) + 1;
    const lines = endLine - startLine + 1;
    console.log(`  ${s.name.padEnd(40)}  L${startLine} (${lines} lines)`);
  }
  console.log();
}

// Print remaining kinds
for (const [kind, syms] of groups) {
  if (printed.has(kind)) continue;
  console.log(`${kind}s:`);
  for (const s of syms) {
    const startLine = (s.range?.start?.line ?? 0) + 1;
    console.log(`  ${s.name.padEnd(40)}  L${startLine}`);
  }
  console.log();
}

process.exit(0);
