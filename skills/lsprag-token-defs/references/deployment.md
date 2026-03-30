# Deployment Guide (Agent Community)

This module exposes a portable `getDecodedTokensFromSymbolWithDefs` in `src/tokenDefsCore.ts`. It runs anywhere as long as you provide a `TokenProvider` that talks to your LSP client or MCP server.

## Quick Start (One-Command)

Clone the repo and install the skill for your agent in one command:

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills \
  && mkdir -p ~/.codex/skills \
  && ln -s ~/.lsprag-skills/skills/lsprag-token-defs ~/.codex/skills/lsprag-token-defs
```

Restart your agent and you should see the skill available.

## Install the Skill

Pick your agent and install the skill folder:

1. Copy or symlink `skills/lsprag-token-defs/` into your agent's skills directory.
2. Restart your agent.

Common install locations (community convention):

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

Example for Codex:

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/skills/lsprag-token-defs ~/.codex/skills/lsprag-token-defs
```

### One-Command Install (local repo)

Run one of these from the repo root (adjust for your agent):

```bash
mkdir -p ~/.codex/skills && ln -s "$(pwd)/skills/lsprag-token-defs" ~/.codex/skills/lsprag-token-defs
```

```bash
mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/lsprag-token-defs" ~/.claude/skills/lsprag-token-defs
```

```bash
mkdir -p ~/.config/opencode/skill && ln -s "$(pwd)/skills/lsprag-token-defs" ~/.config/opencode/skill/lsprag-token-defs
```

### One-Command Install (GitHub repo)

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills && mkdir -p ~/.codex/skills && ln -s ~/.lsprag-skills/skills/lsprag-token-defs ~/.codex/skills/lsprag-token-defs
```

Update later with:

```bash
git -C ~/.lsprag-skills pull
```

## Language Server (No IDE Required)

This skill needs an LSP server that can provide semantic tokens and definitions. If you don't have an IDE, install and run one directly.

### Quick Check (IDE or PATH)

This script finds `gopls` if it already exists (PATH or VS Code Go extension). If it cannot find one, it installs `gopls` using `go install`.
Run it from the repo root.

```bash
gopls_path="$(./scripts/ensure-gopls.sh)"
"$gopls_path" serve
```

Go example:

```bash
go install golang.org/x/tools/gopls@latest
gopls serve
```

Then connect your LSP client (or MCP bridge) to the running server.

## Use from Code (Minimal Node Integration)

1. Import the portable function:

```ts
import { getDecodedTokensFromSymbolWithDefs, TokenProvider } from "./src/tokenDefsCore";
```

2. Provide a `TokenProvider` backed by your LSP client:

```ts
const provider: TokenProvider = {
  openDocument: async (uri) => lspClient.openDocument(uri),
  getDocumentSymbols: async (uri) => lspClient.documentSymbols(uri),
  getSemanticTokens: async (doc) => lspClient.semanticTokens(doc.uri),
  getSemanticTokensLegend: async (doc) => lspClient.semanticTokensLegend(doc.uri),
  getSemanticTokensRange: async (doc, range) => lspClient.semanticTokensRange(doc.uri, range),
  getSemanticTokensLegendRange: async (doc, range) => lspClient.semanticTokensLegendRange(doc.uri, range),
  getDefinitions: async (doc, pos) => lspClient.definitions(doc.uri, pos),
  isInWorkspace: (uri) => uri.startsWith(workspaceRoot),
};
```

3. Call the function:

```ts
const tokensWithDefs = await getDecodedTokensFromSymbolWithDefs(document, symbol, provider);
```

## Use from MCP (Optional)

Wrap `getDecodedTokensFromSymbolWithDefs` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-token-defs": {
      "command": "/path/to/lsprag-token-defs",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.
