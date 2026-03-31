import assert from "node:assert/strict";
import { getDecodedTokensFromSymbolWithDefs } from "../src/tokenDefsCore.js";
import { TokenProvider } from "../src/tokenCore.js";
import { registerProviders } from "../src/providerRegistry.js";
import {
  CoreDecodedToken,
  LspDocument,
  LspLocation,
  LspPosition,
  LspRange,
  LspSymbol,
} from "../src/coreTypes.js";

const text = [
  "function foo() {",
  "  bar();",
  "}",
  "function bar() {}",
  "",
].join("\n");
const lines = text.split("\n");
const lineOffsets: number[] = [0];
for (let i = 0; i < text.length; i++) {
  if (text[i] === "\n") {
    lineOffsets.push(i + 1);
  }
}

function offsetAt(position: LspPosition): number {
  const line = Math.max(0, Math.min(position.line, lineOffsets.length - 1));
  const lineOffset = lineOffsets[line];
  const nextOffset = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : text.length;
  const lineLength = nextOffset - lineOffset;
  const character = Math.max(0, Math.min(position.character, lineLength));
  return lineOffset + character;
}

function positionAt(offset: number): LspPosition {
  let low = 0;
  let high = lineOffsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] > offset) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  const line = Math.max(0, low - 1);
  return { line, character: offset - lineOffsets[line] };
}

function rangeFromOffsets(start: number, end: number): LspRange {
  return { start: positionAt(start), end: positionAt(end) };
}

function getWordAt(position: LspPosition): string {
  const lineText = lines[position.line] ?? "";
  let start = Math.min(position.character, lineText.length);
  let end = start;
  const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  while (start > 0 && isWord(lineText[start - 1])) start -= 1;
  while (end < lineText.length && isWord(lineText[end])) end += 1;
  return lineText.slice(start, end);
}

const document: LspDocument = {
  uri: "file:///fixture/token-defs.ts",
  languageId: "typescript",
  getText: (range?: LspRange) => {
    if (!range) return text;
    const start = offsetAt(range.start);
    const end = offsetAt(range.end);
    return text.slice(start, end);
  },
};

const fooSymbol: LspSymbol = {
  name: "foo",
  range: {
    start: { line: 0, character: 0 },
    end: { line: 2, character: lines[2]?.length ?? 0 },
  },
};

const barDefOffset = text.indexOf("bar() {}");
assert.notEqual(barDefOffset, -1);
const barRange = rangeFromOffsets(barDefOffset, barDefOffset + 3);
const definitions = new Map<string, LspLocation>([["bar", { uri: document.uri, range: barRange }]]);

const fooOffset = text.indexOf("foo() {");
const barCallOffset = text.indexOf("bar();");
const barDefNameOffset = barDefOffset;
assert.notEqual(fooOffset, -1);
assert.notEqual(barCallOffset, -1);

const tokenPositions = [
  { pos: positionAt(fooOffset), length: 3 },
  { pos: positionAt(barCallOffset), length: 3 },
  { pos: positionAt(barDefNameOffset), length: 3 },
];

const semanticData: number[] = [];
let lastLine = 0;
let lastChar = 0;
for (const token of tokenPositions) {
  const deltaLine = token.pos.line - lastLine;
  const deltaStart = deltaLine === 0 ? token.pos.character - lastChar : token.pos.character;
  semanticData.push(deltaLine, deltaStart, token.length, 0, 0);
  lastLine = token.pos.line;
  lastChar = token.pos.character;
}

const provider: TokenProvider = {
  openDocument: async (_uri) => document,
  getDocumentSymbols: async (_uri) => [],
  getSemanticTokensRange: async (_doc, _range) => null,
  getSemanticTokensLegendRange: async (_doc, _range) => null,
  getSemanticTokens: async (_doc) => ({ data: semanticData }),
  getSemanticTokensLegend: async (_doc) => ({ tokenTypes: ["function"], tokenModifiers: [] }),
  getDefinitions: async (_doc, position) => {
    const word = getWordAt(position);
    const location = definitions.get(word);
    return location ? [location] : [];
  },
};
registerProviders({ token: provider });

const tokensWithDefs: CoreDecodedToken[] = await getDecodedTokensFromSymbolWithDefs(document, fooSymbol);
assert.equal(tokensWithDefs.length, 1);
assert.equal(tokensWithDefs[0].word, "bar");
assert.equal(tokensWithDefs[0].definition.length, 1);
assert.equal(tokensWithDefs[0].definition[0].range.start.line, 3);

console.log("PASS: token defs core smoke test");
