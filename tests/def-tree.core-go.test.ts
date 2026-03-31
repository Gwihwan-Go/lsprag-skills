import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDefTree, prettyPrintDefTree } from "../src/treeCore.js";
import {
  LspDocument,
  LspLocation,
  LspPosition,
  LspRange,
  LspSemanticTokens,
  LspSemanticTokensLegend,
  LspSymbol,
} from "../src/coreTypes.js";
import { TokenProvider } from "../src/tokenCore.js";
import { registerProviders } from "../src/providerRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, "fixtures", "def-tree-sample.go");
const text = fs.readFileSync(fixturePath, "utf8");

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

function createDocument(uri: string, contents: string): LspDocument {
  return {
    uri,
    languageId: "go",
    getText: (range?: LspRange) => {
      if (!range) {
        return contents;
      }
      const start = offsetAt(range.start);
      const end = offsetAt(range.end);
      return contents.slice(start, end);
    },
  };
}

function buildFunctionSymbols(source: string): LspSymbol[] {
  const symbols: LspSymbol[] = [];
  const regex = /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source))) {
    const name = match[1];
    const matchIndex = match.index;
    const nameOffset = matchIndex + match[0].indexOf(name);
    const braceStart = source.indexOf("{", matchIndex);
    let braceEnd = source.length;
    if (braceStart !== -1) {
      let depth = 0;
      for (let i = braceStart; i < source.length; i++) {
        if (source[i] === "{") depth += 1;
        if (source[i] === "}") depth -= 1;
        if (depth === 0) {
          braceEnd = i + 1;
          break;
        }
      }
    }

    const range = rangeFromOffsets(matchIndex, braceEnd);
    const selectionRange = rangeFromOffsets(nameOffset, nameOffset + name.length);
    symbols.push({ name, range, selectionRange, children: [] });
  }

  return symbols;
}

function encodeSemanticTokens(tokens: { line: number; char: number; length: number }[]): LspSemanticTokens {
  const sorted = tokens.slice().sort((a, b) => (a.line - b.line) || (a.char - b.char));
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const token of sorted) {
    const deltaLine = token.line - prevLine;
    const deltaStart = deltaLine === 0 ? token.char - prevChar : token.char;
    data.push(deltaLine, deltaStart, token.length, 0, 0);
    prevLine = token.line;
    prevChar = token.char;
  }
  return { data };
}

function extractIdentifierTokens(): { line: number; char: number; length: number }[] {
  const tokens: { line: number; char: number; length: number }[] = [];
  const identifier = /[A-Za-z_][A-Za-z0-9_]*/g;
  lines.forEach((lineText, line) => {
    let match: RegExpExecArray | null;
    while ((match = identifier.exec(lineText))) {
      tokens.push({ line, char: match.index, length: match[0].length });
    }
  });
  return tokens;
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

const document = createDocument("file:///fixture/def-tree-sample.go", text);
const symbols = buildFunctionSymbols(text);
const definitionsByName = new Map<string, LspLocation>();
for (const symbol of symbols) {
  definitionsByName.set(symbol.name, {
    uri: document.uri,
    range: symbol.selectionRange ?? symbol.range,
  });
}

const semanticTokens = encodeSemanticTokens(extractIdentifierTokens());
const legend: LspSemanticTokensLegend = {
  tokenTypes: ["function"],
  tokenModifiers: [],
};

const provider: TokenProvider = {
  openDocument: async () => document,
  getDocumentSymbols: async () => symbols,
  getDefinitions: async (_doc, position) => {
    const word = getWordAt(position);
    const location = definitionsByName.get(word);
    return location ? [location] : [];
  },
  getSemanticTokens: async () => semanticTokens,
  getSemanticTokensLegend: async () => legend,
  getSemanticTokensRange: async () => null,
  getSemanticTokensLegendRange: async () => null,
  log: () => undefined,
};
registerProviders({ token: provider });

const fooSymbol = symbols.find((symbol) => symbol.name === "foo");
assert(fooSymbol, "Expected to find foo symbol");

const tree = await buildDefTree(document, fooSymbol!, 3);
assert.equal(tree.name, "foo");
assert.equal(tree.children.length, 1);
assert.equal(tree.children[0].name, "bar");
assert.equal(tree.children[0].children.length, 1);
assert.equal(tree.children[0].children[0].name, "baz");

const printed = prettyPrintDefTree(tree);
assert(printed.includes("foo"));
assert(printed.includes("bar"));
assert(printed.includes("baz"));

console.log("PASS: buildDefTree core Go smoke test");
