# Deployment Guide (Agent Community)

This module exposes a portable `retrieveDefs` in `src/definitionCore.ts`. It runs anywhere as long as you provide a `DefinitionProvider` that talks to your LSP client or MCP server.

## Quick Start (One‑Command)

Clone the repo and install the skill for your agent in one command:

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills \
  && mkdir -p ~/.codex/skills \
  && ln -s ~/.lsprag-skills/skills/lsprag-retrieve-defs ~/.codex/skills/lsprag-retrieve-defs
```

Restart your agent and you should see the skill available.

## Install the Skill

Pick your agent and install the skill folder:

1. Copy or symlink `skills/lsprag-retrieve-defs/` into your agent’s skills directory.
2. Restart your agent.

Common install locations (community convention):

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

Example for Codex:

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/skills/lsprag-retrieve-defs ~/.codex/skills/lsprag-retrieve-defs
```

### One‑Command Install (local repo)

Run one of these from the repo root (adjust for your agent):

```bash
mkdir -p ~/.codex/skills && ln -s "$(pwd)/skills/lsprag-retrieve-defs" ~/.codex/skills/lsprag-retrieve-defs
```

```bash
mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/lsprag-retrieve-defs" ~/.claude/skills/lsprag-retrieve-defs
```

```bash
mkdir -p ~/.config/opencode/skill && ln -s "$(pwd)/skills/lsprag-retrieve-defs" ~/.config/opencode/skill/lsprag-retrieve-defs
```

### One‑Command Install (GitHub repo)

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills && mkdir -p ~/.codex/skills && ln -s ~/.lsprag-skills/skills/lsprag-retrieve-defs ~/.codex/skills/lsprag-retrieve-defs
```

Update later with:

```bash
git -C ~/.lsprag-skills pull
```

## Language Server (No IDE Required)

This skill needs an LSP server. If you don’t have an IDE, install and run one directly.

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
import { retrieveDefs, DefinitionProvider } from "./src/definitionCore";
```

2. Provide a `DefinitionProvider` backed by your LSP client:

```ts
const provider: DefinitionProvider = {
  getDefinitions: async (doc, pos) => lspClient.definitions(doc.uri, pos),
  isInWorkspace: (uri) => uri.startsWith(workspaceRoot),
};
```

3. Call the function:

```ts
const defs = await retrieveDefs(document, decodedTokens, provider);
```

## Use from MCP (Optional)

Wrap `retrieveDefs` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-retrieve-defs": {
      "command": "/path/to/lsprag-retrieve-defs",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.
