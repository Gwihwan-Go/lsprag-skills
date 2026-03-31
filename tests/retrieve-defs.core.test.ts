import assert from "node:assert/strict";
import { retrieveDefs, DefinitionProvider } from "../src/definitionCore.js";
import { registerProviders } from "../src/providerRegistry.js";
import {
  CoreDecodedToken,
  LspDocument,
  LspLocation,
  LspPosition,
  LspRange,
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
  uri: "file:///fixture/retrieve-defs.ts",
  languageId: "typescript",
  getText: (range?: LspRange) => {
    if (!range) return text;
    const start = offsetAt(range.start);
    const end = offsetAt(range.end);
    return text.slice(start, end);
  },
};

const barNameOffset = text.indexOf("bar() {}");
assert.notEqual(barNameOffset, -1);
const barRange = rangeFromOffsets(barNameOffset, barNameOffset + 3);
const definitions = new Map<string, LspLocation>([
  ["bar", { uri: document.uri, range: barRange }],
]);

const provider: DefinitionProvider = {
  getDefinitions: async (_doc, position) => {
    const word = getWordAt(position);
    const location = definitions.get(word);
    return location ? [location] : [];
  },
};
registerProviders({ definition: provider });

function makeToken(): CoreDecodedToken {
  return {
    id: "1",
    word: "",
    line: 1,
    startChar: 2,
    length: 3,
    type: "function",
    modifiers: [],
    definition: [],
  };
}

const withDefinitions = await retrieveDefs(document, [makeToken()]);
assert.equal(withDefinitions[0].word, "bar");
assert.equal(withDefinitions[0].definition.length, 1);
assert.equal(withDefinitions[0].definition[0].range.start.line, 3);

const skippedDefinitions = await retrieveDefs(document, [makeToken()], true);
assert.equal(skippedDefinitions[0].definition.length, 0);

console.log("PASS: retrieveDefs core smoke test");
