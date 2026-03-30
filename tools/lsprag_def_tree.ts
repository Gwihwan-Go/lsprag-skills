/**
 * lsprag_def_tree — OpenCode tool
 *
 * Deploy: copy this file to ~/.config/opencode/tools/lsprag_def_tree.ts
 * Requires: LSPRAG_SKILLS_ROOT env var pointing to lsprag-skills repo root
 * Requires: npm install --prefix ~/.config/opencode @opencode-ai/plugin
 */
import { tool } from "@opencode-ai/plugin";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function resolveFilePath(filePath: string, directory: string): string {
  if (filePath.startsWith("file://")) {
    return new URL(filePath).pathname;
  }
  return path.isAbsolute(filePath) ? filePath : path.join(directory, filePath);
}

function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

function positionAt(offset: number, offsets: number[]): { line: number; character: number } {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] > offset) high = mid;
    else low = mid + 1;
  }
  const line = Math.max(0, low - 1);
  return { line, character: offset - offsets[line] };
}

function rangeFromOffsets(
  start: number,
  end: number,
  offsets: number[]
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  return { start: positionAt(start, offsets), end: positionAt(end, offsets) };
}

function buildFunctionSymbols(
  text: string,
  lineOffsets: number[],
  languageId: string
): Array<{
  name: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } };
  children: never[];
}> {
  const symbols = [];
  const regex =
    languageId === "go"
      ? /func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
      : /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const name = match[1];
    const matchIndex = match.index;
    const nameOffset = matchIndex + match[0].indexOf(name);
    const braceStart = text.indexOf("{", matchIndex);
    let braceEnd = text.length;
    if (braceStart !== -1) {
      let depth = 0;
      for (let i = braceStart; i < text.length; i++) {
        if (text[i] === "{") depth += 1;
        if (text[i] === "}") depth -= 1;
        if (depth === 0) {
          braceEnd = i + 1;
          break;
        }
      }
    }
    symbols.push({
      name,
      range: rangeFromOffsets(matchIndex, braceEnd, lineOffsets),
      selectionRange: rangeFromOffsets(nameOffset, nameOffset + name.length, lineOffsets),
      children: [] as never[],
    });
  }
  return symbols;
}

function encodeSemanticTokens(tokens: { line: number; char: number; length: number }[]): { data: number[] } {
  const sorted = tokens.slice().sort((a, b) => a.line - b.line || a.char - b.char);
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

function extractIdentifierTokens(lines: string[]): { line: number; char: number; length: number }[] {
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

function getWordAt(lines: string[], position: { line: number; character: number }): string {
  const lineText = lines[position.line] ?? "";
  let start = Math.min(position.character, lineText.length);
  let end = start;
  const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  while (start > 0 && isWord(lineText[start - 1])) start -= 1;
  while (end < lineText.length && isWord(lineText[end])) end += 1;
  return lineText.slice(start, end);
}

export const lsprag_def_tree = tool({
  description:
    "LSPRAG: Build a lightweight definition tree showing which functions/methods a given function calls (JS/TS/Go). " +
    "Use this to understand code structure and call chains. " +
    "Requires LSPRAG_SKILLS_ROOT env var pointing to the lsprag-skills repo root.",
  args: {
    filePath: tool.schema
      .string()
      .describe("Absolute or relative path to the source file (e.g. /path/to/file.ts or ./src/foo.ts)"),
    symbolName: tool.schema.string().describe("Name of the function or method to build the tree from"),
    maxDepth: tool.schema.number().optional().describe("Maximum call depth to traverse (default: 3)"),
  },
  async execute(
    args: { filePath: string; symbolName: string; maxDepth?: number },
    context: { directory: string }
  ) {
    const root = process.env.LSPRAG_SKILLS_ROOT;
    if (!root) {
      return (
        "Error: LSPRAG_SKILLS_ROOT is not set.\n" +
        "Set it to the lsprag-skills repo root, e.g.:\n" +
        "  export LSPRAG_SKILLS_ROOT=~/.lsprag-skills"
      );
    }

    const treeCoreUrl = pathToFileURL(path.join(root, "src", "treeCore.ts")).href;
    let buildDefTree: (
      doc: unknown,
      sym: unknown,
      provider: unknown,
      maxDepth: number
    ) => Promise<unknown>;
    let prettyPrintDefTree: (tree: unknown) => string;
    try {
      const mod = await import(treeCoreUrl);
      buildDefTree = mod.buildDefTree;
      prettyPrintDefTree = mod.prettyPrintDefTree;
    } catch (err) {
      return `Error: could not load treeCore from ${root}/src/treeCore.ts\n${err}`;
    }

    const absolutePath = resolveFilePath(args.filePath, context.directory);
    if (!fs.existsSync(absolutePath)) {
      return `Error: file not found: ${absolutePath}`;
    }

    const text = fs.readFileSync(absolutePath, "utf8");
    const lines = text.split("\n");
    const lineOffsets = buildLineOffsets(text);
    const extension = path.extname(absolutePath).toLowerCase();
    const languageId = extension === ".go" ? "go" : "typescript";

    const document = {
      uri: pathToFileURL(absolutePath).href,
      languageId,
      getText: (range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      }) => {
        if (!range) return text;
        const start = lineOffsets[range.start.line] + range.start.character;
        const end = lineOffsets[range.end.line] + range.end.character;
        return text.slice(start, end);
      },
    };

    const symbols = buildFunctionSymbols(text, lineOffsets, languageId);
    const definitionsByName = new Map<
      string,
      { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }
    >();
    for (const symbol of symbols) {
      definitionsByName.set(symbol.name, {
        uri: document.uri,
        range: symbol.selectionRange ?? symbol.range,
      });
    }

    const semanticTokens = encodeSemanticTokens(extractIdentifierTokens(lines));
    const legend = { tokenTypes: ["function"], tokenModifiers: [] };

    const provider = {
      openDocument: async () => document,
      getDocumentSymbols: async () => symbols,
      getDefinitions: async (
        _doc: unknown,
        position: { line: number; character: number }
      ) => {
        const word = getWordAt(lines, position);
        const location = definitionsByName.get(word);
        return location ? [location] : [];
      },
      getSemanticTokens: async () => semanticTokens,
      getSemanticTokensLegend: async () => legend,
      getSemanticTokensRange: async () => null,
      getSemanticTokensLegendRange: async () => null,
    };

    const target = symbols.find((s) => s.name === args.symbolName);
    if (!target) {
      const names = symbols.map((s) => s.name).join(", ");
      return `Error: symbol "${args.symbolName}" not found in ${absolutePath}\nAvailable symbols: ${names || "(none found)"}`;
    }

    const tree = await buildDefTree(document, target, provider, args.maxDepth ?? 3);
    return prettyPrintDefTree(tree as Parameters<typeof prettyPrintDefTree>[0]);
  },
});
