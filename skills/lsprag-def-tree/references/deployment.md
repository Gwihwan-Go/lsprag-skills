# Deployment Guide (Agent Community)

This module exposes a portable `buildDefTree` in `src/treeCore.ts`. It runs anywhere as long as you provide a `TokenProvider` that talks to your LSP client or MCP server.

## Quick Start (One‑Command)

Clone the repo and install the skill for your agent in one command:

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills \
  && mkdir -p ~/.codex/skills \
  && ln -s ~/.lsprag-skills/skills/lsprag-def-tree ~/.codex/skills/lsprag-def-tree
```

Restart your agent and you should see the skill available.

## Install the Skill

Pick your agent and install the skill folder:

1. Copy or symlink `skills/lsprag-def-tree/` into your agent’s skills directory.
2. Restart your agent.

Common install locations (community convention):

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

Example for Codex:

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/skills/lsprag-def-tree ~/.codex/skills/lsprag-def-tree
```

### One-Command Install (local repo)

Run one of these from the repo root (adjust for your agent):

```bash
mkdir -p ~/.codex/skills && ln -s "$(pwd)/skills/lsprag-def-tree" ~/.codex/skills/lsprag-def-tree
```

```bash
mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/lsprag-def-tree" ~/.claude/skills/lsprag-def-tree
```

```bash
mkdir -p ~/.config/opencode/skill && ln -s "$(pwd)/skills/lsprag-def-tree" ~/.config/opencode/skill/lsprag-def-tree
```

### One-Command Install (GitHub repo)

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills && mkdir -p ~/.codex/skills && ln -s ~/.lsprag-skills/skills/lsprag-def-tree ~/.codex/skills/lsprag-def-tree
```

Update later with:

```bash
git -C ~/.lsprag-skills pull
```

## Language Server (No IDE Required)

This skill needs an LSP server. If you don’t have an IDE, install and run one directly.

Go example:

```bash
go install golang.org/x/tools/gopls@latest
gopls serve
```

Then connect your LSP client (or MCP bridge) to the running server.

## Use from Code (Minimal Node Integration)

1. Import the portable function:

```ts
import { buildDefTree, TokenProvider } from "./src/treeCore";
```

2. Provide a `TokenProvider` backed by your LSP client:

```ts
const provider: TokenProvider = {
  openDocument: async (uri) => ({ uri, getText: () => fs.readFileSync(uri, "utf8") }),
  getDocumentSymbols: async (uri) => lspClient.documentSymbols(uri),
  getDefinitions: async (doc, pos) => lspClient.definitions(doc.uri, pos),
  getSemanticTokensRange: async (doc, range) => lspClient.semanticTokensRange(doc.uri, range),
  getSemanticTokensLegendRange: async (doc, range) => lspClient.semanticTokensLegendRange(doc.uri, range)
};
```

3. Call the function:

```ts
const tree = await buildDefTree(document, symbol, provider, 3);
```

## Use from MCP (Optional)

Wrap `buildDefTree` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-def-tree": {
      "command": "/path/to/lsprag-def-tree",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.

## Notes

- This workflow relies on semantic tokens + definitions from your LSP server.
- If your LSP does not support `textDocument/semanticTokens`, you must implement a fallback tokenizer.
