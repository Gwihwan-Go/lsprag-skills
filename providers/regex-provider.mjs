import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function uriToPath(uri) {
  if (!uri) return null;
  if (uri.startsWith("file://")) {
    return fileURLToPath(uri);
  }
  return uri;
}

function languageIdFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".go") return "go";
  if (ext === ".py") return "python";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  return "typescript";
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
    if (lineOffsets[mid] > offset) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  const line = Math.max(0, low - 1);
  return { line, character: offset - lineOffsets[line] };
}

function offsetAt(position, lineOffsets, textLength) {
  const line = Math.max(0, Math.min(position.line, lineOffsets.length - 1));
  const lineOffset = lineOffsets[line];
  const nextOffset = line + 1 < lineOffsets.length ? lineOffsets[line + 1] : textLength;
  const lineLength = nextOffset - lineOffset;
  const character = Math.max(0, Math.min(position.character, lineLength));
  return lineOffset + character;
}

function rangeFromOffsets(start, end, lineOffsets) {
  return { start: positionAt(start, lineOffsets), end: positionAt(end, lineOffsets) };
}

function getLineText(text, lineOffsets, line) {
  const start = lineOffsets[line] ?? 0;
  const end = line + 1 < lineOffsets.length ? lineOffsets[line + 1] - 1 : text.length;
  return text.slice(start, end);
}

function getWordAt(text, lineOffsets, position) {
  const lineText = getLineText(text, lineOffsets, position.line);
  let start = Math.min(position.character, lineText.length);
  let end = start;
  const isWord = (ch) => /[A-Za-z0-9_]/.test(ch);
  while (start > 0 && isWord(lineText[start - 1])) start -= 1;
  while (end < lineText.length && isWord(lineText[end])) end += 1;
  return lineText.slice(start, end);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBraceBlockEnd(text, startIndex) {
  const braceStart = text.indexOf("{", startIndex);
  if (braceStart === -1) return text.length;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") depth -= 1;
    if (depth === 0) {
      return i + 1;
    }
  }
  return text.length;
}

function findPythonBlockEnd(text, lineOffsets, defIndex) {
  const defLine = positionAt(defIndex, lineOffsets).line;
  const defLineText = getLineText(text, lineOffsets, defLine);
  // Get the indentation level of the def/class line
  const defIndent = defLineText.match(/^(\s*)/)[1].length;

  // Walk forward: the block ends when we hit a non-empty line at same or lower indent
  let lastBodyLine = defLine;
  for (let line = defLine + 1; line < lineOffsets.length; line++) {
    const lineText = getLineText(text, lineOffsets, line);
    const stripped = lineText.trim();
    if (stripped === "" || stripped.startsWith("#")) {
      // Skip blank lines and comments but track them as potential body
      continue;
    }
    const indent = lineText.match(/^(\s*)/)[1].length;
    if (indent <= defIndent) {
      // Dedented back to same or lower level — block ended
      break;
    }
    lastBodyLine = line;
  }
  // Return end of the last body line
  const endOffset = lastBodyLine + 1 < lineOffsets.length
    ? lineOffsets[lastBodyLine + 1]
    : text.length;
  return endOffset;
}

function getDocumentData(document) {
  const text = document.getText();
  const lineOffsets = buildLineOffsets(text);
  return { text, lineOffsets };
}

async function openDocument(uri) {
  const filePath = uriToPath(uri);
  if (!filePath) {
    throw new Error("Invalid document uri");
  }
  const text = fs.readFileSync(filePath, "utf8");
  const lineOffsets = buildLineOffsets(text);
  const languageId = languageIdFromPath(filePath);
  const normalizedUri = uri.startsWith("file://") ? uri : pathToFileURL(filePath).href;
  return {
    uri: normalizedUri,
    languageId,
    getText: (range) => {
      if (!range) return text;
      const start = offsetAt(range.start, lineOffsets, text.length);
      const end = offsetAt(range.end, lineOffsets, text.length);
      return text.slice(start, end);
    },
  };
}

async function getDocumentSymbols(uri) {
  const doc = await openDocument(uri);
  const { text, lineOffsets } = getDocumentData(doc);
  const languageId = doc.languageId ?? "typescript";
  const symbols = [];
  const patterns = [];
  if (languageId === "go") {
    patterns.push(/func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
  } else if (languageId === "python") {
    patterns.push(/def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
  } else {
    patterns.push(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g);
  }

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text))) {
      const name = match[1];
      const matchIndex = match.index;
      const nameOffset = matchIndex + match[0].indexOf(name);
      let endOffset = text.length;
      if (languageId !== "python") {
        endOffset = findBraceBlockEnd(text, matchIndex);
      } else {
        endOffset = findPythonBlockEnd(text, lineOffsets, matchIndex);
      }
      const range = rangeFromOffsets(matchIndex, endOffset, lineOffsets);
      const selectionRange = rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets);
      symbols.push({ name, range, selectionRange, kind: 12, children: [] });
    }
  }

  return symbols;
}

function extractIdentifierTokens(text, lineOffsets) {
  const tokens = [];
  const identifier = /[A-Za-z_][A-Za-z0-9_]*/g;
  for (let line = 0; line < lineOffsets.length; line++) {
    const lineText = getLineText(text, lineOffsets, line);
    let match;
    while ((match = identifier.exec(lineText))) {
      tokens.push({ line, char: match.index, length: match[0].length });
    }
  }
  return tokens;
}

function encodeSemanticTokens(tokens) {
  const sorted = tokens.slice().sort((a, b) => a.line - b.line || a.char - b.char);
  const data = [];
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

async function getSemanticTokens(document) {
  const { text, lineOffsets } = getDocumentData(document);
  const tokens = extractIdentifierTokens(text, lineOffsets);
  return encodeSemanticTokens(tokens);
}

async function getSemanticTokensLegend() {
  return { tokenTypes: ["symbol"], tokenModifiers: [] };
}

async function getDefinitions(document, position) {
  const { text, lineOffsets } = getDocumentData(document);
  const languageId = document.languageId ?? "typescript";
  const word = getWordAt(text, lineOffsets, position);
  if (!word) return [];
  const escaped = escapeRegExp(word);
  let regex;
  if (languageId === "go") {
    regex = new RegExp(`\\bfunc\\s+${escaped}\\s*\\(`, "g");
  } else if (languageId === "python") {
    regex = new RegExp(`\\bdef\\s+${escaped}\\s*\\(`, "g");
  } else {
    regex = new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`, "g");
  }
  const match = regex.exec(text);
  if (!match) return [];
  const nameOffset = match.index + match[0].indexOf(word);
  const range = rangeFromOffsets(nameOffset, nameOffset + word.length, lineOffsets);
  return [{ uri: document.uri, range }];
}

async function getReferences(document, position) {
  const { text, lineOffsets } = getDocumentData(document);
  const word = getWordAt(text, lineOffsets, position);
  if (!word) return [];
  const escaped = escapeRegExp(word);
  const regex = new RegExp(`\\b${escaped}\\b`, "g");
  const references = [];
  for (let line = 0; line < lineOffsets.length; line++) {
    const lineText = getLineText(text, lineOffsets, line);
    let match;
    while ((match = regex.exec(lineText))) {
      const lineStart = lineOffsets[line] ?? 0;
      const startOffset = lineStart + match.index;
      const endOffset = startOffset + match[0].length;
      references.push({ uri: document.uri, range: rangeFromOffsets(startOffset, endOffset, lineOffsets) });
    }
  }
  return references;
}

// ── Call Hierarchy (regex-based) ──────────────────────────────────────────────

function findFunctionCalls(text, lineOffsets, languageId) {
  // Find all function/method call sites: identifier followed by (
  const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  const defKeywords = new Set(["def", "function", "func", "if", "elif", "while", "for", "with", "class", "catch", "switch", "return", "import", "from", "print", "assert", "raise", "except", "typeof", "new"]);
  const calls = [];
  let match;
  while ((match = callPattern.exec(text))) {
    const name = match[1];
    if (defKeywords.has(name)) continue;
    const pos = positionAt(match.index, lineOffsets);
    calls.push({ name, position: pos, offset: match.index });
  }
  return calls;
}

function getModuleSymbol(uri, text, lineOffsets) {
  const filePath = uriToPath(uri);
  const moduleName = filePath ? path.basename(filePath, path.extname(filePath)) : "module";
  const endPos = positionAt(text.length, lineOffsets);
  return {
    name: moduleName,
    kind: 2, // Module
    uri,
    range: { start: { line: 0, character: 0 }, end: endPos },
    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: moduleName.length } },
  };
}

async function prepareCallHierarchy(uri, position) {
  const doc = await openDocument(uri);
  const { text, lineOffsets } = getDocumentData(doc);
  const allSymbols = await getSymbols(uri);  // includes module symbol
  const word = getWordAt(text, lineOffsets, position);

  // Find by name match first, then by position containment
  let target = null;
  if (word) {
    target = allSymbols.find(s => s.name === word) ?? null;
  }
  if (!target) {
    // Find narrowest symbol containing this position
    let best = null;
    for (const sym of allSymbols) {
      const sr = sym.selectionRange;
      if (position.line === sr.start.line && position.character >= sr.start.character && position.character <= sr.end.character) {
        if (!best || (sym.range.end.line - sym.range.start.line) < (best.range.end.line - best.range.start.line)) {
          best = sym;
        }
      }
    }
    target = best;
  }
  // Fall back to module symbol if position is at file start
  if (!target && position.line === 0 && position.character === 0) {
    target = allSymbols.find(s => s.kind === 2) ?? null;
  }

  if (!target) return null;

  return [{
    name: target.name,
    kind: target.kind ?? 12,
    uri: doc.uri,
    range: target.range,
    selectionRange: target.selectionRange,
  }];
}

async function getIncomingCalls(item) {
  const doc = await openDocument(item.uri);
  const symbols = await getDocumentSymbols(item.uri);
  const { text, lineOffsets } = getDocumentData(doc);
  const calls = findFunctionCalls(text, lineOffsets, doc.languageId);

  const incoming = [];
  for (const sym of symbols) {
    if (sym.name === item.name) continue;
    // Check if any call to item.name is inside this symbol's range
    const matchingCalls = calls.filter(c =>
      c.name === item.name &&
      c.position.line >= sym.range.start.line &&
      c.position.line <= sym.range.end.line
    );
    if (matchingCalls.length > 0) {
      incoming.push({
        from: {
          name: sym.name,
          kind: sym.kind ?? 12,
          uri: item.uri,
          range: sym.range,
          selectionRange: sym.selectionRange,
        },
        fromRanges: matchingCalls.map(c => ({
          start: c.position,
          end: { line: c.position.line, character: c.position.character + c.name.length },
        })),
      });
    }
  }
  return incoming;
}

async function getOutgoingCalls(item) {
  const doc = await openDocument(item.uri);
  const symbols = await getDocumentSymbols(item.uri);
  const { text, lineOffsets } = getDocumentData(doc);
  const calls = findFunctionCalls(text, lineOffsets, doc.languageId);

  // Calls inside item's range
  const callsInRange = calls.filter(c =>
    c.position.line >= item.range.start.line &&
    c.position.line <= item.range.end.line &&
    c.name !== item.name
  );

  // Group by callee name and resolve to symbols
  const calleeMap = new Map();
  for (const c of callsInRange) {
    if (!calleeMap.has(c.name)) calleeMap.set(c.name, []);
    calleeMap.get(c.name).push(c);
  }

  const outgoing = [];
  for (const [calleeName, calleeCalls] of calleeMap) {
    const sym = symbols.find(s => s.name === calleeName);
    const target = sym
      ? { name: sym.name, kind: sym.kind ?? 12, uri: item.uri, range: sym.range, selectionRange: sym.selectionRange }
      : { name: calleeName, kind: 12, uri: item.uri,
          range: { start: calleeCalls[0].position, end: calleeCalls[0].position },
          selectionRange: { start: calleeCalls[0].position, end: calleeCalls[0].position } };

    outgoing.push({
      to: target,
      fromRanges: calleeCalls.map(c => ({
        start: c.position,
        end: { line: c.position.line, character: c.position.character + c.name.length },
      })),
    });
  }
  return outgoing;
}

// ── Exports ──────────────────────────────────────────────────────────────────

async function getSymbols(uri) {
  const doc = await openDocument(uri);
  const { text, lineOffsets } = getDocumentData(doc);
  const funcSymbols = await getDocumentSymbols(uri);
  // Add module-level symbol so callers can reference module-level code
  const moduleSym = getModuleSymbol(uri, text, lineOffsets);
  return [moduleSym, ...funcSymbols];
}

export const callHierarchyProvider = {
  prepareCallHierarchy,
  getIncomingCalls,
  getOutgoingCalls,
};

export const provider = {
  openDocument,
  getDocumentSymbols,
  getSymbols,
  getSemanticTokens,
  getSemanticTokensLegend,
  getSemanticTokensRange: async () => null,
  getSemanticTokensLegendRange: async () => null,
  getDefinitions,
  getReferences,
  prepareCallHierarchy,
  getIncomingCalls,
  getOutgoingCalls,
};

export const tokenProvider = provider;
export const definitionProvider = provider;
export const referenceProvider = provider;
export const providers = { token: provider, definition: provider, reference: provider, callHierarchy: callHierarchyProvider };
export default provider;
