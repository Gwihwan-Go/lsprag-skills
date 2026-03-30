import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const fixturePathTs = path.join(repoRoot, "tests", "fixtures", "def-tree-sample.ts");
const fixturePathGo = path.join(repoRoot, "tests", "fixtures", "def-tree-sample.go");

function commandExists(cmd: string): boolean {
  const result = spawnSync("which", [cmd], { encoding: "utf8" });
  return result.status === 0;
}

if (!commandExists("opencode")) {
  console.log("SKIP: opencode not found in PATH");
  process.exit(0);
}

const aidpModel = process.env.AIDP_MODEL || "gemini-2.5-pro";
const aidpApiVersion = process.env.AIDP_API_VERSION || "2024-03-01-preview";
const forceAidp = process.env.OPENCODE_USE_AIDP === "1";
const testModel = process.env.OPENCODE_TEST_MODEL || (forceAidp ? `aidp/${aidpModel}` : "opencode/gpt-5-nano");
const usesOpenCodeModel = testModel.startsWith("opencode/");
const usesAidpModel = testModel.startsWith("aidp/");
const useAidp = usesAidpModel;
const requiresProviderKey = !usesOpenCodeModel && !usesAidpModel;
if (usesAidpModel && (!process.env.AIDP_AK || !process.env.AIDP_ENDPOINT)) {
  console.log("SKIP: missing AIDP_AK or AIDP_ENDPOINT for aidp/* model");
  process.exit(0);
}
if (requiresProviderKey && !process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
  console.log("SKIP: missing DEEPSEEK_API_KEY or OPENAI_API_KEY for non-opencode model");
  process.exit(0);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lsprag-opencode-"));
const configDir = path.join(tempDir, "opencode");
const toolsDir = path.join(configDir, "tools");
fs.mkdirSync(toolsDir, { recursive: true });

const opencodeConfigPath = path.join(configDir, "opencode.json");
if (useAidp) {
  fs.writeFileSync(
    opencodeConfigPath,
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          aidp: {
            npm: "@ai-sdk/openai-compatible",
            name: "AIDP",
            options: {
              apiKey: "{env:AIDP_AK}",
              baseURL: `{env:AIDP_ENDPOINT}/openai/deployments/${aidpModel}`,
              headers: {
                "X-TT-LOGID": "{env:AIDP_LOGID}",
              },
              queryParams: {
                "api-version": aidpApiVersion,
              },
            },
            models: {
              [aidpModel]: {
                name: aidpModel,
                limit: {
                  context: 1048576,
                  output: 65536,
                },
              },
            },
          },
        },
        model: `aidp/${aidpModel}`,
      },
      null,
      2
    )
  );
} else {
  const userConfig = path.join(os.homedir(), ".config", "opencode", "opencode.json");
  if (fs.existsSync(userConfig)) {
    fs.copyFileSync(userConfig, opencodeConfigPath);
  } else {
    fs.writeFileSync(
      opencodeConfigPath,
      JSON.stringify(
        {
          provider: {
            openai: {
              options: {
                apiKey: "{env:OPENAI_API_KEY}",
                baseURL: "https://api.openai.com/v1",
              },
            },
          },
        },
        null,
        2
      )
    );
  }
}

const userNodeModules = path.join(os.homedir(), ".config", "opencode", "node_modules");
const tempNodeModules = path.join(configDir, "node_modules");
const pluginModulePath = path.join(userNodeModules, "@opencode-ai", "plugin");
if (!fs.existsSync(pluginModulePath)) {
  console.log("SKIP: missing ~/.config/opencode/node_modules/@opencode-ai/plugin");
  process.exit(0);
}
if (useAidp) {
  const aidpModulePath = path.join(userNodeModules, "@ai-sdk", "openai-compatible");
  if (!fs.existsSync(aidpModulePath)) {
    console.log("SKIP: missing ~/.config/opencode/node_modules/@ai-sdk/openai-compatible");
    process.exit(0);
  }
}
if (fs.existsSync(userNodeModules)) {
  try {
    fs.symlinkSync(userNodeModules, tempNodeModules, "dir");
  } catch {
    // best effort; opencode will fail if plugin isn't available
  }
}

const toolFilePath = path.join(toolsDir, "lsprag_def_tree.ts");
const toolSource = `
import { tool } from "@opencode-ai/plugin";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function resolveFilePath(filePath, directory) {
  if (filePath.startsWith("file://")) {
    return new URL(filePath).pathname;
  }
  return path.isAbsolute(filePath) ? filePath : path.join(directory, filePath);
}

function buildLineOffsets(text) {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\n") offsets.push(i + 1);
  }
  return offsets;
}

function positionAt(offset, offsets) {
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

function rangeFromOffsets(start, end, offsets) {
  return { start: positionAt(start, offsets), end: positionAt(end, offsets) };
}

function buildFunctionSymbols(text, lineOffsets, languageId) {
  const symbols = [];
  const regex =
    languageId === "go"
      ? /func\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(/g
      : /function\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(/g;
  let match;
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
      children: [],
    });
  }
  return symbols;
}

function encodeSemanticTokens(tokens) {
  const sorted = tokens.slice().sort((a, b) => (a.line - b.line) || (a.char - b.char));
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

function extractIdentifierTokens(lines) {
  const tokens = [];
  const identifier = /[A-Za-z_][A-Za-z0-9_]*/g;
  lines.forEach((lineText, line) => {
    let match;
    while ((match = identifier.exec(lineText))) {
      tokens.push({ line, char: match.index, length: match[0].length });
    }
  });
  return tokens;
}

function getWordAt(lines, position) {
  const lineText = lines[position.line] ?? "";
  let start = Math.min(position.character, lineText.length);
  let end = start;
  const isWord = (ch) => /[A-Za-z0-9_]/.test(ch);
  while (start > 0 && isWord(lineText[start - 1])) start -= 1;
  while (end < lineText.length && isWord(lineText[end])) end += 1;
  return lineText.slice(start, end);
}

export const lsprag_def_tree = tool({
  description: "LSPRAG: build a lightweight definition tree (JS/TS/Go function declarations).",
  args: {
    filePath: tool.schema.string().describe("Absolute path or relative path to the source file"),
    symbolName: tool.schema.string().describe("Function name to build the tree from"),
    maxDepth: tool.schema.number().optional().describe("Maximum depth for traversal"),
  },
  async execute(args, context) {
    const root = process.env.LSPRAG_SKILLS_ROOT;
    if (!root) {
      return "Error: set LSPRAG_SKILLS_ROOT to the lsprag-skills repo root.";
    }

    const absolutePath = resolveFilePath(args.filePath, context.directory);
    const text = fs.readFileSync(absolutePath, "utf8");
    const lines = text.split("\\n");
    const lineOffsets = buildLineOffsets(text);
    const extension = path.extname(absolutePath).toLowerCase();
    const languageId = extension === ".go" ? "go" : "typescript";

    const { buildDefTree, prettyPrintDefTree } = await import(
      pathToFileURL(path.join(root, "src", "treeCore.ts")).href
    );

    const document = {
      uri: pathToFileURL(absolutePath).href,
      languageId,
      getText: (range) => {
        if (!range) return text;
        const start = lineOffsets[range.start.line] + range.start.character;
        const end = lineOffsets[range.end.line] + range.end.character;
        return text.slice(start, end);
      },
    };

    const symbols = buildFunctionSymbols(text, lineOffsets, languageId);
    const definitionsByName = new Map();
    for (const symbol of symbols) {
      definitionsByName.set(symbol.name, { uri: document.uri, range: symbol.selectionRange ?? symbol.range });
    }

    const semanticTokens = encodeSemanticTokens(extractIdentifierTokens(lines));
    const legend = { tokenTypes: ["function"], tokenModifiers: [] };

    const provider = {
      openDocument: async () => document,
      getDocumentSymbols: async () => symbols,
      getDefinitions: async (_doc, position) => {
        const word = getWordAt(lines, position);
        const location = definitionsByName.get(word);
        return location ? [location] : [];
      },
      getSemanticTokens: async () => semanticTokens,
      getSemanticTokensLegend: async () => legend,
      getSemanticTokensRange: async () => null,
      getSemanticTokensLegendRange: async () => null,
    };

    const target = symbols.find((symbol) => symbol.name === args.symbolName);
    if (!target) {
      return \`Error: symbol "\${args.symbolName}" not found\`;
    }

    const tree = await buildDefTree(document, target, provider, args.maxDepth ?? 3);
    return prettyPrintDefTree(tree);
  },
});
`;
fs.writeFileSync(toolFilePath, toolSource);

function runScenario(options: {
  fixturePath: string;
  symbolName: string;
  expectedNames: string[];
}) {
  const prompt = [
    "Use the tool lsprag_def_tree exactly once.",
    `Arguments: filePath="${options.fixturePath}", symbolName="${options.symbolName}", maxDepth=3.`,
    "After the tool call, answer with exactly: DEF_TREE_DONE",
  ].join(" ");

  const result = spawnSync(
    "opencode",
    [
      "run",
      "--agent",
      "build",
      "--format",
      "json",
      "--model",
      testModel,
      "--dir",
      repoRoot,
      prompt,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        XDG_CONFIG_HOME: tempDir,
        LSPRAG_SKILLS_ROOT: repoRoot,
      },
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr || "";
    if (stderr.includes("Session not found")) {
      console.log("SKIP: opencode session not available");
      process.exit(0);
    }
    console.error(stderr);
    throw new Error(`opencode run failed with status ${result.status}`);
  }

  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let toolOutput = "";
  const toolEvents: Array<{ tool: string; output: string }> = [];
  const parseErrors: string[] = [];
  let runError = "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "error") {
        runError = typeof event.error === "string" ? event.error : JSON.stringify(event.error);
        continue;
      }
      if (
        event.type === "tool_use" &&
        String(event.part?.tool ?? "").includes("lsprag_def_tree")
      ) {
        const output = event.part?.state?.output;
        toolOutput = typeof output === "string" ? output : JSON.stringify(output);
        break;
      }
      if (event.type === "tool_use") {
        const output = event.part?.state?.output;
        const outputString = typeof output === "string" ? output : JSON.stringify(output);
        toolEvents.push({ tool: String(event.part?.tool ?? "unknown"), output: outputString });
      }
    } catch {
      parseErrors.push(line);
      continue;
    }
  }

  if (!toolOutput) {
    const debug = [
      "No lsprag_def_tree tool output found.",
      `run error: ${runError || "none"}`,
      `tool_use events: ${JSON.stringify(toolEvents, null, 2)}`,
      `parse errors: ${parseErrors.slice(0, 5).join("\n")}`,
    ].join("\n");
    throw new Error(debug);
  }

  for (const name of options.expectedNames) {
    assert(
      toolOutput.includes(name),
      `Expected tool output to include ${name}. Output:\n${toolOutput}`
    );
  }

  console.log(`PASS: opencode integration smoke test (${path.basename(options.fixturePath)})`);
}

const scenarios = [
  { fixturePath: fixturePathTs, symbolName: "foo", expectedNames: ["foo", "bar", "baz"] },
  { fixturePath: fixturePathGo, symbolName: "foo", expectedNames: ["foo", "bar", "baz"] },
];

for (const scenario of scenarios) {
  runScenario(scenario);
}
