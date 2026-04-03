/**
 * call-hierarchy.core.test.ts
 *
 * Unit tests for callHierarchy core logic.
 * Uses an inline mock CallHierarchyProvider (no LSP server required).
 *
 * Tests:
 *   1. Incoming calls returns callers
 *   2. Outgoing calls returns callees
 *   3. "both" direction returns incoming + outgoing sections
 *   4. Depth limit is respected (truncation)
 *   5. Cycles are detected and don't cause infinite loops
 *   6. Empty result returns empty string
 *   7. prettyPrintCallTree formats tree correctly
 *   8. Multiple prepare items are all processed
 *   9. Symbol with no incoming or outgoing calls
 */
import assert from "node:assert/strict";
import {
    getCallHierarchyInfo,
    prettyPrintCallTree,
    type CallHierarchyProvider,
    type CallHierarchyItem,
    type CallHierarchyIncomingCall,
    type CallHierarchyOutgoingCall,
    type CallHierarchyNode,
} from "../src/callHierarchyCore.js";
import { _resetProvidersForTests } from "../src/providerRegistry.js";
import type { LspRange } from "../src/coreTypes.js";

_resetProvidersForTests();

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRange(
    startLine: number, startChar: number,
    endLine: number, endChar: number
): LspRange {
    return {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar },
    };
}

function makeItem(
    name: string, uri: string,
    startLine: number, endLine: number
): CallHierarchyItem {
    return {
        name,
        kind: 12, // Function
        uri,
        range: makeRange(startLine, 0, endLine, 1),
        selectionRange: makeRange(startLine, 16, startLine, 16 + name.length),
    };
}

// ── fixture items (matching call-hierarchy-sample.ts) ────────────────────────

const URI = "file:///src/server.ts";

const parseBodyItem     = makeItem("parseBody",     URI, 9, 11);
const formatJsonItem    = makeItem("formatJson",    URI, 13, 15);
const sendResponseItem  = makeItem("sendResponse",  URI, 17, 20);
const handleRequestItem = makeItem("handleRequest", URI, 22, 25);
const routeGetItem      = makeItem("routeGet",      URI, 27, 29);
const routePostItem     = makeItem("routePost",     URI, 31, 33);
const mainItem          = makeItem("main",          URI, 35, 38);
const standaloneItem    = makeItem("standalone",    URI, 40, 42);

// ── incoming/outgoing call maps ──────────────────────────────────────────────

const incomingMap = new Map<string, CallHierarchyIncomingCall[]>([
    [handleRequestItem.name, [
        { from: routeGetItem,  fromRanges: [makeRange(28, 4, 28, 17)] },
        { from: routePostItem, fromRanges: [makeRange(32, 4, 32, 17)] },
        { from: mainItem,      fromRanges: [makeRange(37, 4, 37, 17)] },
    ]],
    [parseBodyItem.name, [
        { from: handleRequestItem, fromRanges: [makeRange(23, 17, 23, 26)] },
    ]],
    [sendResponseItem.name, [
        { from: handleRequestItem, fromRanges: [makeRange(24, 4, 24, 16)] },
    ]],
    [formatJsonItem.name, [
        { from: sendResponseItem, fromRanges: [makeRange(18, 20, 18, 30)] },
    ]],
    [routeGetItem.name, []],
    [routePostItem.name, []],
    [mainItem.name, []],
    [standaloneItem.name, []],
]);

const outgoingMap = new Map<string, CallHierarchyOutgoingCall[]>([
    [handleRequestItem.name, [
        { to: parseBodyItem,    fromRanges: [makeRange(23, 17, 23, 26)] },
        { to: sendResponseItem, fromRanges: [makeRange(24, 4, 24, 16)] },
    ]],
    [sendResponseItem.name, [
        { to: formatJsonItem, fromRanges: [makeRange(18, 20, 18, 30)] },
    ]],
    [routeGetItem.name, [
        { to: handleRequestItem, fromRanges: [makeRange(28, 4, 28, 17)] },
    ]],
    [routePostItem.name, [
        { to: handleRequestItem, fromRanges: [makeRange(32, 4, 32, 17)] },
    ]],
    [mainItem.name, [
        { to: handleRequestItem, fromRanges: [makeRange(37, 4, 37, 17)] },
    ]],
    [parseBodyItem.name, []],
    [formatJsonItem.name, []],
    [standaloneItem.name, []],
]);

// ── item lookup by position ──────────────────────────────────────────────────

const allItems = [
    parseBodyItem, formatJsonItem, sendResponseItem,
    handleRequestItem, routeGetItem, routePostItem,
    mainItem, standaloneItem,
];

function findItemAtPosition(line: number, character: number): CallHierarchyItem | null {
    for (const item of allItems) {
        const sel = item.selectionRange;
        if (sel.start.line === line &&
            character >= sel.start.character &&
            character <= sel.end.character) {
            return item;
        }
    }
    return null;
}

// ── mock provider ────────────────────────────────────────────────────────────

const provider: CallHierarchyProvider = {
    prepareCallHierarchy: async (uri, position) => {
        const item = findItemAtPosition(position.line, position.character);
        return item ? [item] : null;
    },
    getIncomingCalls: async (item) => {
        return incomingMap.get(item.name) ?? [];
    },
    getOutgoingCalls: async (item) => {
        return outgoingMap.get(item.name) ?? [];
    },
};

// ─── Test 1: incoming calls returns callers ──────────────────────────────────
{
    const pos = handleRequestItem.selectionRange.start;
    const result = await getCallHierarchyInfo(URI, pos, provider, { direction: "incoming" });

    assert(result.includes("Incoming calls"), "Should have 'Incoming calls' header");
    assert(result.includes("routeGet"), "Should include routeGet as caller");
    assert(result.includes("routePost"), "Should include routePost as caller");
    assert(result.includes("main"), "Should include main as caller");
    console.log("PASS: incoming calls returns callers");
}

// ─── Test 2: outgoing calls returns callees ──────────────────────────────────
{
    const pos = handleRequestItem.selectionRange.start;
    const result = await getCallHierarchyInfo(URI, pos, provider, { direction: "outgoing" });

    assert(result.includes("Outgoing calls"), "Should have 'Outgoing calls' header");
    assert(result.includes("parseBody"), "Should include parseBody as callee");
    assert(result.includes("sendResponse"), "Should include sendResponse as callee");
    console.log("PASS: outgoing calls returns callees");
}

// ─── Test 3: "both" direction returns incoming + outgoing sections ───────────
{
    const pos = handleRequestItem.selectionRange.start;
    const result = await getCallHierarchyInfo(URI, pos, provider, { direction: "both" });

    assert(result.includes("Incoming calls"), "Should have incoming section");
    assert(result.includes("Outgoing calls"), "Should have outgoing section");
    assert(result.includes("routeGet"), "Should include caller");
    assert(result.includes("parseBody"), "Should include callee");
    console.log("PASS: 'both' direction returns incoming + outgoing sections");
}

// ─── Test 4: depth limit is respected ────────────────────────────────────────
{
    // outgoing from routeGet with depth=1 should show handleRequest but not
    // handleRequest's children (parseBody, sendResponse)
    const pos = routeGetItem.selectionRange.start;
    const result = await getCallHierarchyInfo(URI, pos, provider, {
        direction: "outgoing",
        depth: 1,
    });

    assert(result.includes("handleRequest"), "Should include direct callee handleRequest");
    assert(result.includes("[...]"), "Should show truncation marker");
    console.log("PASS: depth limit is respected");
}

// ─── Test 5: deep recursion works without cycles ─────────────────────────────
{
    // outgoing from main → handleRequest → parseBody, sendResponse → formatJson
    const pos = mainItem.selectionRange.start;
    const result = await getCallHierarchyInfo(URI, pos, provider, {
        direction: "outgoing",
        depth: 5,
    });

    assert(result.includes("handleRequest"), "Should reach handleRequest");
    assert(result.includes("parseBody"), "Should reach parseBody (depth 2)");
    assert(result.includes("sendResponse"), "Should reach sendResponse (depth 2)");
    assert(result.includes("formatJson"), "Should reach formatJson (depth 3)");
    console.log("PASS: deep recursion works without cycles");
}

// ─── Test 6: cycle detection ─────────────────────────────────────────────────
{
    // Create a provider with a cycle: A calls B, B calls A
    const itemA = makeItem("fnA", "file:///cycle.ts", 0, 5);
    const itemB = makeItem("fnB", "file:///cycle.ts", 6, 11);

    const cycleProvider: CallHierarchyProvider = {
        prepareCallHierarchy: async (_uri, _pos) => [itemA],
        getIncomingCalls: async () => [],
        getOutgoingCalls: async (item) => {
            if (item.name === "fnA") return [{ to: itemB, fromRanges: [makeRange(2, 4, 2, 7)] }];
            if (item.name === "fnB") return [{ to: itemA, fromRanges: [makeRange(8, 4, 8, 7)] }];
            return [];
        },
    };

    const result = await getCallHierarchyInfo("file:///cycle.ts", { line: 0, character: 16 }, cycleProvider, {
        direction: "outgoing",
        depth: 10,
    });

    // Should terminate without hanging
    assert(typeof result === "string", "Should return a string (not hang)");
    assert(result.includes("fnA"), "Should include fnA");
    assert(result.includes("fnB"), "Should include fnB");
    console.log("PASS: cycle detection prevents infinite recursion");
}

// ─── Test 7: empty result returns empty string ───────────────────────────────
{
    const emptyProvider: CallHierarchyProvider = {
        prepareCallHierarchy: async () => null,
        getIncomingCalls: async () => [],
        getOutgoingCalls: async () => [],
    };

    const result = await getCallHierarchyInfo(URI, { line: 99, character: 0 }, emptyProvider);
    assert.equal(result, "", "Should return empty string when prepareCallHierarchy returns null");
    console.log("PASS: empty result returns empty string");
}

// ─── Test 8: prettyPrintCallTree formats correctly ───────────────────────────
{
    const root: CallHierarchyNode = {
        item: handleRequestItem,
        callSites: [],
        children: [
            {
                item: routeGetItem,
                callSites: [makeRange(28, 4, 28, 17)],
                children: [],
            },
            {
                item: routePostItem,
                callSites: [makeRange(32, 4, 32, 17)],
                children: [],
            },
        ],
    };

    const output = prettyPrintCallTree(root);
    const lines = output.split("\n");

    assert(lines[0].includes("handleRequest"), "Root should be handleRequest");
    assert(lines[1].includes("├─"), "First child should have ├─ connector");
    assert(lines[1].includes("routeGet"), "First child should be routeGet");
    assert(lines[2].includes("└─"), "Last child should have └─ connector");
    assert(lines[2].includes("routePost"), "Last child should be routePost");
    console.log("PASS: prettyPrintCallTree formats correctly");
}

// ─── Test 9: symbol with no incoming/outgoing calls ─────────────────────────
{
    const pos = standaloneItem.selectionRange.start;
    const inResult = await getCallHierarchyInfo(URI, pos, provider, { direction: "incoming" });
    assert(inResult.includes("no incoming calls"), "Should indicate no incoming calls");

    const outResult = await getCallHierarchyInfo(URI, pos, provider, { direction: "outgoing" });
    assert(outResult.includes("no outgoing calls"), "Should indicate no outgoing calls");
    console.log("PASS: symbol with no calls reports correctly");
}

// ─── Test 10: default direction is incoming ──────────────────────────────────
{
    const pos = handleRequestItem.selectionRange.start;
    const result = await getCallHierarchyInfo(URI, pos, provider);

    assert(result.includes("Incoming calls"), "Default direction should be incoming");
    assert(!result.includes("Outgoing calls"), "Default should not include outgoing");
    console.log("PASS: default direction is incoming");
}

console.log("\nPASS: all call-hierarchy core tests");
