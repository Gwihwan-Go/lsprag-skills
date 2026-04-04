#!/usr/bin/env node
/**
 * call-hierarchy-cli.ts — show incoming/outgoing call hierarchy for a symbol
 *
 * Usage:
 *   lsprag callHierarchy --file <path> --symbol <name>
 *   lsprag callHierarchy --file <path> --symbol <name> --location <line>:<col>
 *   lsprag callHierarchy --file <path> --symbol <name> --direction incoming|outgoing|both
 *   lsprag callHierarchy --file <path> --symbol <name> --depth <n>
 *
 * Requires LSPRAG_LSP_PROVIDER to be set — no regex fallback.
 * The provider must expose:
 *   prepareCallHierarchy(uri, position): Promise<CallHierarchyItem[]>
 *   getIncomingCalls(item): Promise<CallHierarchyIncomingCall[]>
 *   getOutgoingCalls(item): Promise<CallHierarchyOutgoingCall[]>
 *
 * Without --location:
 *   Resolves the symbol by name via getDocumentSymbols / getSymbols, then
 *   calls prepareCallHierarchy at that position.
 *
 * With --location <line>:<col> (1-indexed):
 *   Calls prepareCallHierarchy at that position directly.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
    getCallHierarchyInfo,
    type CallHierarchyProvider,
    type CallHierarchyDirection,
} from "../src/callHierarchyCore.js";

// ── require LSP provider ───────────────────────────────────────────────────────
const providerPath = process.env.LSPRAG_LSP_PROVIDER;
if (!providerPath) {
    console.error("Error: callHierarchy requires a real LSP provider.");
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
const filePath = args["file"] ?? args["f"];
const symbolName = args["symbol"] ?? args["s"];
const rawLocation = args["location"] ?? args["loc"];
const rawDirection = args["direction"] ?? args["dir"] ?? "incoming";
const rawDepth = args["depth"] ?? args["d"];

if (!filePath || !symbolName) {
    console.error(
        "Usage: lsprag callHierarchy --file <path> --symbol <name> " +
        "[--location <line>:<col>] [--direction incoming|outgoing|both] [--depth <n>]"
    );
    process.exit(1);
}

const validDirections: CallHierarchyDirection[] = ["incoming", "outgoing", "both"];
if (!validDirections.includes(rawDirection as CallHierarchyDirection)) {
    console.error(
        `Error: invalid --direction "${rawDirection}". Expected one of: ${validDirections.join(", ")}`
    );
    process.exit(1);
}
const direction = rawDirection as CallHierarchyDirection;

const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

const maxDepth = rawDepth ? parseInt(rawDepth, 10) : 3;
if (Number.isNaN(maxDepth) || maxDepth < 1) {
    console.error(`Error: invalid --depth value "${rawDepth}". Expected a positive integer.`);
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

// Normalise module shape
function extractProvider(mod: any): CallHierarchyProvider {
    // Prefer the full provider (which may also expose getSymbols/getDocumentSymbols)
    const fallback = mod.provider ?? mod.default ?? mod;
    if (typeof fallback?.prepareCallHierarchy === "function") return fallback;

    // Fall back to bundle's callHierarchy-specific provider
    const bundle = mod.providers ?? mod.providerBundle ?? null;
    if (bundle?.callHierarchy) return bundle.callHierarchy;

    const explicit = mod.callHierarchyProvider;
    if (typeof explicit?.prepareCallHierarchy === "function") return explicit;

    console.error("Error: the loaded provider does not expose a prepareCallHierarchy method.");
    console.error(
        "Make sure your provider exports { prepareCallHierarchy, getIncomingCalls, getOutgoingCalls }."
    );
    process.exit(1);
}

const provider: CallHierarchyProvider = extractProvider(rawMod);

// ── resolve position ──────────────────────────────────────────────────────────
const docUri = pathToFileURL(absolutePath).href;

let position: { line: number; character: number };

if (rawLocation) {
    const [rawLine, rawCol] = rawLocation.split(":");
    const loc1Line = parseInt(rawLine, 10);
    const loc1Col = parseInt(rawCol ?? "1", 10);
    if (Number.isNaN(loc1Line)) {
        console.error(`Error: invalid --location "${rawLocation}". Expected <line>:<col> (1-indexed)`);
        process.exit(1);
    }
    position = { line: loc1Line - 1, character: loc1Col - 1 };
} else {
    // Try to get symbols from the provider to resolve by name.
    // The provider may expose getSymbols or getDocumentSymbols.
    const getSymbols =
        (provider as any).getSymbols ??
        (provider as any).getDocumentSymbols;

    if (!getSymbols) {
        console.error(
            "Error: --location is required when the provider doesn't expose getSymbols or getDocumentSymbols."
        );
        process.exit(1);
    }

    let symbols: any[];
    try {
        symbols = await getSymbols(docUri);
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

// ── get call hierarchy ───────────────────────────────────────────────────────
const relPath = path.relative(process.cwd(), absolutePath) || absolutePath;
const lineNum = position.line + 1;
const colNum = position.character + 1;

const result = await getCallHierarchyInfo(docUri, position, provider, {
    direction,
    depth: maxDepth,
});

if (!result || result.trim() === "") {
    console.log(`Call hierarchy for '${symbolName}' (${relPath}:${lineNum}:${colNum}):`);
    console.log("");
    console.log("  (no call hierarchy found)");
    process.exit(0);
}

console.log(result);
