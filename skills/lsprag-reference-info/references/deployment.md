# Deployment Guide (Agent Community)

This module exposes a portable `getReferenceInfo` in `src/referenceCore.ts`. It runs anywhere as long as you provide a `ReferenceProvider` that talks to your LSP client or MCP server.

## Quick Start (One‑Command)

Clone the repo and install the skill for your agent in one command:

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills \
  && mkdir -p ~/.codex/skills \
  && ln -s ~/.lsprag-skills/skills/lsprag-reference-info ~/.codex/skills/lsprag-reference-info
```

Restart your agent and you should see the skill available.

## Install the Skill

Pick your agent and install the skill folder:

1. Copy or symlink `skills/lsprag-reference-info/` into your agent’s skills directory.
2. Restart your agent.

Common install locations (community convention):

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

Example for Codex:

```bash
mkdir -p ~/.codex/skills
ln -s /absolute/path/to/skills/lsprag-reference-info ~/.codex/skills/lsprag-reference-info
```

### One‑Command Install (local repo)

Run one of these from the repo root (adjust for your agent):

```bash
mkdir -p ~/.codex/skills && ln -s "$(pwd)/skills/lsprag-reference-info" ~/.codex/skills/lsprag-reference-info
```

```bash
mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/lsprag-reference-info" ~/.claude/skills/lsprag-reference-info
```

```bash
mkdir -p ~/.config/opencode/skill && ln -s "$(pwd)/skills/lsprag-reference-info" ~/.config/opencode/skill/lsprag-reference-info
```

### One‑Command Install (GitHub repo)

```bash
git clone --depth 1 https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills && mkdir -p ~/.codex/skills && ln -s ~/.lsprag-skills/skills/lsprag-reference-info ~/.codex/skills/lsprag-reference-info
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
import { getReferenceInfo, ReferenceProvider } from "./src/referenceCore";
```

2. Provide a `ReferenceProvider` backed by your LSP client:

```ts
const provider: ReferenceProvider = {
  getReferences: async (doc, pos) => lspClient.references(doc.uri, pos),
  openDocument: async (uri) => ({ uri, getText: () => fs.readFileSync(uri, "utf8") }),
  getSymbols: async (uri) => lspClient.documentSymbols(uri),
};
```

3. Call the function:

```ts
const info = await getReferenceInfo(document, range, provider, { refWindow: 60 });
```

## Use from MCP (Optional)

Wrap `getReferenceInfo` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-reference-info": {
      "command": "/path/to/lsprag-reference-info",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.

## References

- https://github.com/lsp-client/lsp-skill
- https://github.com/DeusData/codebase-memory-mcp
