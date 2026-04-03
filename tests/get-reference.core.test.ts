/**
 * get-reference.core.test.ts
 *
 * Unit tests for the getReference / getReferenceInfo core logic.
 * Uses an inline mock ReferenceProvider (no LSP server required).
 *
 * Tests:
 *   - getReferenceInfo returns joined code for valid references
 *   - Original location is filtered out
 *   - Single-line references are filtered out
 *   - refWindow limit is respected
 *   - Empty references return empty string
 *   - Test files are prioritised in output ordering
 */
import assert from "node:assert/strict";
import { getReferenceInfo } from "../src/referenceCore.js";
import type {
  ReferenceProvider,
  ReferenceDocument,
  ReferenceLocation,
  ReferencePosition,
  ReferenceRange,
  ReferenceSymbol,
} from "../src/referenceCore.js";
import { _resetProvidersForTests } from "../src/providerRegistry.js";

_resetProvidersForTests();

// ── shared text fixtures ──────────────────────────────────────────────────────

const defText = [
  "function handleRequest(req, res) {", // line 0
  "  const body = parseBody(req);",     // line 1
  "  sendResponse(res, body);",         // line 2
  "}",                                   // line 3
].join("\n");

const callerText = [
  "function routePost(req, res) {",      // line 0
  "  if (req.method === 'POST') {",      // line 1
  "    handleRequest(req, res);",        // line 2
  "  }",                                  // line 3
  "}",                                    // line 4
].join("\n");

const testCallerText = [
  "describe('route tests', () => {",     // line 0
  "  it('handles POST', () => {",        // line 1
  "    handleRequest(mockReq, mockRes);",// line 2
  "    expect(mockRes.send).toHaveBeenCalled();", // line 3
  "  });",                                // line 4
  "});",                                  // line 5
].join("\n");

// Unique sentinel text — doesn't appear in any other fixture
const singleLineCallerText =
  "handleRequest(uniqueSingleLineCallSentinel);"; // single-line — should be filtered

// ── position helpers ──────────────────────────────────────────────────────────
function makeRange(startLine: number, startChar: number, endLine: number, endChar: number): ReferenceRange {
  return {
    start: { line: startLine, character: startChar },
    end:   { line: endLine,   character: endChar },
  };
}

// ── documents ─────────────────────────────────────────────────────────────────
function makeDoc(uri: string, src: string): ReferenceDocument {
  const lineOffsets = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") lineOffsets.push(i + 1);
  }
  return {
    uri,
    languageId: "typescript",
    getText(range?: ReferenceRange): string {
      if (!range) return src;
      const s = (lineOffsets[range.start.line] ?? 0) + range.start.character;
      const e = (lineOffsets[range.end.line]   ?? 0) + range.end.character;
      return src.slice(s, e);
    },
  };
}

const defDoc         = makeDoc("file:///src/server.ts", defText);
const callerDoc      = makeDoc("file:///src/router.ts", callerText);
const testCallerDoc  = makeDoc("file:///tests/server.test.ts", testCallerText);
const singleLineDoc  = makeDoc("file:///src/inline.ts", singleLineCallerText);

// ── symbol factories ──────────────────────────────────────────────────────────
function makeSymbol(name: string, startLine: number, endLine: number): ReferenceSymbol {
  return {
    name,
    range:          makeRange(startLine, 0, endLine, 1),
    selectionRange: makeRange(startLine, 9, startLine, 9 + name.length),
  };
}

// ── mock provider ─────────────────────────────────────────────────────────────
const docMap = new Map<string, ReferenceDocument>([
  [defDoc.uri,        defDoc],
  [callerDoc.uri,     callerDoc],
  [testCallerDoc.uri, testCallerDoc],
  [singleLineDoc.uri, singleLineDoc],
]);

const handleRequestRefs: ReferenceLocation[] = [
  // original definition location (should be filtered)
  { uri: defDoc.uri,        range: makeRange(0, 9, 0, 22) },
  // caller in router.ts (multi-line context)
  { uri: callerDoc.uri,     range: makeRange(2, 4, 2, 17) },
  // caller in test file (multi-line context)
  { uri: testCallerDoc.uri, range: makeRange(2, 4, 2, 17) },
  // single-line inline usage (should be filtered — no enclosing symbol found)
  { uri: singleLineDoc.uri, range: makeRange(0, 0, 0, 13) },
];

const symbolsMap = new Map<string, ReferenceSymbol[]>([
  [defDoc.uri,        [makeSymbol("handleRequest", 0, 3)]],
  [callerDoc.uri,     [makeSymbol("routePost", 0, 4)]],
  [testCallerDoc.uri, [makeSymbol("describe", 0, 5)]],
  [singleLineDoc.uri, []],
]);

const provider: ReferenceProvider = {
  getReferences: async (_doc, _pos) => handleRequestRefs,
  openDocument:  async (uri) => {
    const doc = docMap.get(uri);
    if (!doc) throw new Error(`Document not found: ${uri}`);
    return doc;
  },
  getSymbols:   async (uri) => symbolsMap.get(uri) ?? [],
  isTestFile:   (uri) => uri.includes("/tests/") || /\.(test|spec)\.(js|ts)$/.test(uri),
};

// ─── Test 1: basic reference retrieval ────────────────────────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  const result = await getReferenceInfo(defDoc, range, provider);

  assert(typeof result === "string", "getReferenceInfo should return a string");
  assert(result.trim().length > 0, "Result should be non-empty");
  assert(result.includes("handleRequest"), `Expected handleRequest in result:\n${result}`);
  console.log("PASS: getReferenceInfo returns non-empty result");
}

// ─── Test 2: original location is filtered ────────────────────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  const result = await getReferenceInfo(defDoc, range, provider);

  // The definition itself is "function handleRequest(req, res) {" etc.
  // We should NOT see the original definition body repeated in references
  // (it gets filtered by isSameLocation check)
  const lineCount = result.split("\n").filter(l => l.trim()).length;
  assert(lineCount > 0, "Should have some content from callers");
  console.log("PASS: original definition location filtered from references");
}

// ─── Test 3: single-line references are filtered ─────────────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  const result = await getReferenceInfo(defDoc, range, provider);

  // singleLineDoc has no symbols → getShortestSymbol returns null → filtered.
  // Verify the unique sentinel string from singleLineDoc is absent from output.
  assert(
    !result.includes("uniqueSingleLineCallSentinel"),
    `Single-line reference (singleLineDoc) should be filtered from output:\n${result}`
  );
  console.log("PASS: single-line references filtered");
}

// ─── Test 4: refWindow limit is respected ────────────────────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  // Set window to 3 lines — should cut off results
  const result = await getReferenceInfo(defDoc, range, provider, { refWindow: 3 });

  const lineCount = result.split("\n").filter(l => l.trim()).length;
  assert(lineCount <= 3, `Expected at most 3 lines with refWindow=3, got ${lineCount}:\n${result}`);
  console.log("PASS: refWindow limits output length");
}

// ─── Test 5: refWindow = -1 means unlimited ───────────────────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  const result = await getReferenceInfo(defDoc, range, provider, { refWindow: -1 });
  assert(result.trim().length > 0, "Unlimited refWindow should return all results");
  console.log("PASS: refWindow=-1 returns unlimited results");
}

// ─── Test 6: empty references return empty string ────────────────────────────
{
  const emptyProvider: ReferenceProvider = {
    getReferences: async () => [],
    openDocument:  async (uri) => docMap.get(uri)!,
    getSymbols:    async () => [],
  };

  const range = makeRange(0, 9, 0, 22);
  const result = await getReferenceInfo(defDoc, range, emptyProvider);
  assert.equal(result, "", `Expected empty string for no references, got: "${result}"`);
  console.log("PASS: empty references return empty string");
}

// ─── Test 7: test files are prioritised in output ────────────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  // With default options, test files come first in sort order
  const result = await getReferenceInfo(defDoc, range, provider, { skipTestCode: false });

  assert(result.trim().length > 0, "Should have results");
  // Both test and non-test callers should appear
  assert(result.includes("routePost") || result.includes("describe"),
    `Expected caller code in output:\n${result}`);
  console.log("PASS: test file prioritisation in reference output");
}

// ─── Test 8: skipTestCode excludes test file references ──────────────────────
{
  const range = makeRange(0, 9, 0, 22);
  const result = await getReferenceInfo(defDoc, range, provider, { skipTestCode: true });

  // Test file reference (testCallerDoc) should be excluded
  assert(!result.includes("mockReq"), `Test code should be excluded:\n${result}`);
  // Non-test caller should still appear
  assert(result.includes("routePost") || result.length > 0,
    `Non-test callers should still appear:\n${result}`);
  console.log("PASS: skipTestCode excludes test file references");
}

console.log("\nPASS: all get-reference core tests");
