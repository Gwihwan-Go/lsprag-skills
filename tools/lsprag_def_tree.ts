/**
 * lsprag_def_tree — OpenCode tool
 *
 * Deploy: copy this file to ~/.config/opencode/tools/lsprag_def_tree.ts
 * Requires: LSPRAG_SKILLS_ROOT env var pointing to lsprag-skills repo root
 *           (e.g. export LSPRAG_SKILLS_ROOT=~/.lsprag-skills)
 *
 * This tool calls the CLI script via a subprocess — no dynamic TS import needed.
 */
import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function resolveFilePath(filePath: string, directory: string): string {
  if (filePath.startsWith("file://")) {
    return new URL(filePath).pathname;
  }
  return path.isAbsolute(filePath) ? filePath : path.join(directory, filePath);
}

export const lsprag_def_tree = tool({
  description:
    "LSPRAG: Build a lightweight definition tree showing which functions/methods a given function calls (JS/TS/Go). " +
    "Use this to understand code structure and call chains. " +
    "Works without a language server. " +
    "Requires LSPRAG_SKILLS_ROOT env var (e.g. export LSPRAG_SKILLS_ROOT=~/.lsprag-skills) " +
    "and Node.js with npx tsx available.",
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
    // Resolve LSPRAG_SKILLS_ROOT — fall back to ~/.lsprag-skills if not set
    const root =
      process.env.LSPRAG_SKILLS_ROOT ||
      path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".lsprag-skills");

    const cliScript = path.join(root, "scripts", "def-tree-cli.ts");
    if (!fs.existsSync(cliScript)) {
      return (
        `Error: lsprag-skills not found at ${root}\n` +
        "Install it with:\n" +
        "  git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills\n" +
        "  cd ~/.lsprag-skills && npm install\n" +
        "  export LSPRAG_SKILLS_ROOT=~/.lsprag-skills"
      );
    }

    const absolutePath = resolveFilePath(args.filePath, context.directory);
    if (!fs.existsSync(absolutePath)) {
      return `Error: file not found: ${absolutePath}`;
    }

    const depth = args.maxDepth ?? 3;

    try {
      const output = execSync(
        `npx tsx "${cliScript}" --file "${absolutePath}" --symbol "${args.symbolName}" --depth ${depth}`,
        {
          env: { ...process.env, LSPRAG_SKILLS_ROOT: root },
          cwd: root,
          timeout: 30000,
          encoding: "utf8",
        }
      );
      return output.trim() || `(no output — symbol "${args.symbolName}" may have no callees)`;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const stderr = error.stderr?.trim() ?? "";
      const stdout = error.stdout?.trim() ?? "";
      const detail = stderr || stdout || (error as Error).message;
      return `Error running lsprag-def-tree:\n${detail}`;
    }
  },
});
