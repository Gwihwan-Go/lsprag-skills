import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function toAbsolutePath(uriOrPath) {
  if (uriOrPath.startsWith("file://")) return fileURLToPath(uriOrPath);
  return path.resolve(uriOrPath);
}

function languageIdFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".go") return "go";
  if (ext === ".py") return "python";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  return "typescript";
}

function isWordChar(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  const isLower = code >= 97 && code <= 122;
  const isUpper = code >= 65 && code <= 90;
  const isDigit = code >= 48 && code <= 57;
  return isLower || isUpper || isDigit || ch === "_";
}

function isIdentifierStart(ch) {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  const isLower = code >= 97 && code <= 122;
  const isUpper = code >= 65 && code <= 90;
  return isLower || isUpper || ch === "_";
}

function buildLineOffsets(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

function positionAt(offset, lineOffsets) {
  let low = 0;
  let high = lineOffsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] > offset) high = mid;
    else low = mid + 1;
  }
  const line = Math.max(0, low - 1);
  return { line, character: offset - lineOffsets[line] };
}

function offsetAt(position, lineOffsets, textLength) {
  const line = Math.max(0, Math.min(position.line, lineOffsets.length - 1));
  const lineOffset = lineOffsets[line] ?? 0;
  const nextOffset = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : textLength;
  const maxChar = Math.max(0, nextOffset - lineOffset);
  const char = Math.max(0, Math.min(position.character, maxChar));
  return lineOffset + char;
}

function rangeFromOffsets(start, end, lineOffsets) {
  return { start: positionAt(start, lineOffsets), end: positionAt(end, lineOffsets) };
}

function lineTextAt(text, lineOffsets, line) {
  const start = lineOffsets[line] ?? 0;
  const end = line + 1 < lineOffsets.length ? (lineOffsets[line + 1] - 1) : text.length;
  return text.slice(start, end);
}

function leadingSpaceCount(line) {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  return i;
}

function findBraceBlockEnd(text, startIndex) {
  const braceStart = text.indexOf("{", startIndex);
  if (braceStart === -1) return text.length;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function findPythonBlockEnd(text, lineOffsets, startIndex) {
  const lines = text.split("\n");
  const startLine = positionAt(startIndex, lineOffsets).line;
  const header = lines[startLine] ?? "";
  const headerIndent = leadingSpaceCount(header);
  let foundBody = false;
  let endLine = lines.length;

  for (let line = startLine + 1; line < lines.length; line++) {
    const raw = lines[line] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const indent = leadingSpaceCount(raw);
    if (!foundBody) {
      if (indent <= headerIndent) {
        endLine = line;
        break;
      }
      foundBody = true;
      continue;
    }

    if (indent <= headerIndent) {
      endLine = line;
      break;
    }
  }

  if (endLine >= lines.length) return text.length;
  return lineOffsets[endLine] ?? text.length;
}

function parseFunctionSymbols(text, lineOffsets, languageId) {
  const symbols = [];
  const keywords = [];
  if (languageId === "go") keywords.push("func ");
  else if (languageId === "python") keywords.push("def ");
  else keywords.push("function ");

  for (const keyword of keywords) {
    let cursor = 0;
    while (cursor < text.length) {
      const idx = text.indexOf(keyword, cursor);
      if (idx === -1) break;

      const before = idx > 0 ? text[idx - 1] : "";
      if (before && isWordChar(before)) {
        cursor = idx + keyword.length;
        continue;
      }

      let nameStart = idx + keyword.length;
      while (nameStart < text.length && (text[nameStart] === " " || text[nameStart] === "\t")) nameStart++;
      if (nameStart >= text.length || !isIdentifierStart(text[nameStart])) {
        cursor = idx + keyword.length;
        continue;
      }

      let nameEnd = nameStart + 1;
      while (nameEnd < text.length && isWordChar(text[nameEnd])) nameEnd++;
      const name = text.slice(nameStart, nameEnd);
      if (!name) {
        cursor = idx + keyword.length;
        continue;
      }

      const endOffset =
        languageId === "python"
          ? findPythonBlockEnd(text, lineOffsets, idx)
          : findBraceBlockEnd(text, idx);

      symbols.push({
        name,
        kind: 12,
        range: rangeFromOffsets(idx, endOffset, lineOffsets),
        selectionRange: rangeFromOffsets(nameStart, nameEnd, lineOffsets),
        children: [],
      });

      cursor = nameEnd;
    }
  }

  return symbols;
}

function getWordAtPosition(lines, position) {
  const lineText = lines[position.line] ?? "";
  let start = Math.min(position.character, lineText.length);
  let end = start;
  while (start > 0 && isWordChar(lineText[start - 1])) start--;
  while (end < lineText.length && isWordChar(lineText[end])) end++;
  return lineText.slice(start, end);
}

function encodeSemanticTokens(tokens) {
  const sorted = tokens.slice().sort((a, b) => a.line - b.line || a.char - b.char);
  const data = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const tok of sorted) {
    const deltaLine = tok.line - prevLine;
    const deltaStart = deltaLine === 0 ? tok.char - prevChar : tok.char;
    data.push(deltaLine, deltaStart, tok.length, 0, 0);
    prevLine = tok.line;
    prevChar = tok.char;
  }
  return { data };
}

function collectIdentifierTokens(text, lineOffsets) {
  const tokens = [];
  for (let line = 0; line < lineOffsets.length; line++) {
    const lt = lineTextAt(text, lineOffsets, line);
    let i = 0;
    while (i < lt.length) {
      if (!isIdentifierStart(lt[i])) {
        i++;
        continue;
      }
      const start = i;
      i++;
      while (i < lt.length && isWordChar(lt[i])) i++;
      tokens.push({ line, char: start, length: i - start });
    }
  }
  return tokens;
}

const cache = new Map();

function parseDocument(uri) {
  const normalizedUri = uri.startsWith("file://") ? uri : pathToFileURL(toAbsolutePath(uri)).href;
  const cached = cache.get(normalizedUri);
  if (cached) return cached;

  const filePath = toAbsolutePath(normalizedUri);
  const text = fs.readFileSync(filePath, "utf8");
  const lineOffsets = buildLineOffsets(text);
  const languageId = languageIdFromPath(filePath);
  const lines = text.split("\n");
  const symbols = parseFunctionSymbols(text, lineOffsets, languageId);
  const definitionsByName = new Map();
  for (const sym of symbols) {
    definitionsByName.set(sym.name, { uri: normalizedUri, range: sym.selectionRange });
  }

  const document = {
    uri: normalizedUri,
    languageId,
    getText(range) {
      if (!range) return text;
      const start = offsetAt(range.start, lineOffsets, text.length);
      const end = offsetAt(range.end, lineOffsets, text.length);
      return text.slice(start, end);
    },
  };

  const parsed = { filePath, text, lineOffsets, lines, symbols, definitionsByName, document };
  cache.set(normalizedUri, parsed);
  return parsed;
}

async function openDocument(uri) {
  return parseDocument(uri).document;
}

async function getDocumentSymbols(uri) {
  return parseDocument(uri).symbols;
}

async function getDefinitions(document, position) {
  const parsed = parseDocument(document.uri);
  const word = getWordAtPosition(parsed.lines, position);
  const loc = parsed.definitionsByName.get(word);
  return loc ? [loc] : [];
}

async function getSemanticTokens(document) {
  const parsed = parseDocument(document.uri);
  const tokens = collectIdentifierTokens(parsed.text, parsed.lineOffsets);
  return encodeSemanticTokens(tokens);
}

async function getSemanticTokensLegend() {
  return { tokenTypes: ["symbol"], tokenModifiers: [] };
}

export const provider = {
  openDocument,
  getDocumentSymbols,
  getDefinitions,
  getSemanticTokens,
  getSemanticTokensLegend,
  getSemanticTokensRange: async () => null,
  getSemanticTokensLegendRange: async () => null,
};

export const tokenProvider = provider;
export const definitionProvider = provider;
export const referenceProvider = provider;
export const providers = { token: provider, definition: provider, reference: provider };
export default provider;
