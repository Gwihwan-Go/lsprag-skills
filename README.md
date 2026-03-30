# lsprag-skills

Portable LSP analysis tools for AI agents — build definition trees, resolve symbol references, and decode semantic tokens from any codebase without VS Code.

## What Is This?

This repository ships four skills that let AI agents (Claude Code, OpenCode, etc.) analyze code using Language Server Protocol (LSP) data:

| Skill | What it does |
|-------|-------------|
| `lsprag-def-tree` | Build a definition tree from a symbol (shows what functions/methods a function calls) |
| `lsprag-reference-info` | Find all callers of a symbol across a codebase |
| `lsprag-retrieve-defs` | Resolve where each token in a symbol is defined |
| `lsprag-token-defs` | Extract tokens from a symbol and resolve their definitions in one call |

**No VS Code required.** Each skill is a portable TypeScript module you wire to any LSP server.

## Prerequisites

- **Node.js 18+** and **npm** (to run the TypeScript modules)
- **An LSP server** for your language (e.g. `gopls` for Go, `tsserver` for TypeScript)

## Quick Install

```bash
# 1. Clone and install dependencies
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
cd ~/.lsprag-skills
npm install

# 2. Verify everything works
npm test
```

## Install for Claude Code

The skills in `skills/` are markdown skill files for Claude Code. Copy them to your Claude skills directory:

```bash
REPO=~/.lsprag-skills
mkdir -p ~/.claude/skills
cp -r "$REPO/skills/lsprag-def-tree"         ~/.claude/skills/
cp -r "$REPO/skills/lsprag-reference-info"   ~/.claude/skills/
cp -r "$REPO/skills/lsprag-retrieve-defs"    ~/.claude/skills/
cp -r "$REPO/skills/lsprag-token-defs"       ~/.claude/skills/
```

Then tell Claude the path to this repo so it can run the code:

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

Add that line to your `~/.bashrc` or `~/.zshrc` to make it permanent.

**Usage in Claude Code:**

Ask Claude to use `$lsprag-def-tree` (or any other skill) in your prompt, or Claude will automatically invoke it when you ask about code structure.

## Install for OpenCode

OpenCode tools live in `~/.config/opencode/tools/`. Copy the ready-to-use tool file:

```bash
REPO=~/.lsprag-skills
mkdir -p ~/.config/opencode/tools
cp "$REPO/tools/lsprag_def_tree.ts" ~/.config/opencode/tools/
```

Set the repo root so the tool can find the core modules:

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

Add that to your `~/.bashrc` or `~/.zshrc`.

Restart OpenCode. The tool `lsprag_def_tree` will appear automatically.

> **Note:** OpenCode's plugin system requires `@opencode-ai/plugin`.
> Install it if missing: `npm install --prefix ~/.config/opencode @opencode-ai/plugin`

## One-Line Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/Gwihwan-Go/lsprag-skills/main/install.sh | bash
```

Or run locally from the repo root:

```bash
bash install.sh
```

The script detects whether you have Claude Code or OpenCode installed and wires up the tools automatically.

## Use the CLI Scripts Directly

The `scripts/` directory has standalone CLI wrappers you can call from the terminal (or from a Claude Code Bash tool):

```bash
# Build a definition tree for a function
npx tsx ~/.lsprag-skills/scripts/def-tree-cli.ts --file /path/to/file.ts --symbol myFunction

# Find references to a symbol
npx tsx ~/.lsprag-skills/scripts/reference-info-cli.ts --file /path/to/file.ts --line 10 --col 5
```

## LSP Server Setup

The skills need an LSP server running for your language.

### Go (`gopls`)

```bash
go install golang.org/x/tools/gopls@latest
```

Helper script that finds or installs gopls automatically:

```bash
gopls_path="$(~/.lsprag-skills/scripts/ensure-gopls.sh)"
```

### TypeScript (`tsserver`)

```bash
npm install -g typescript
# tsserver is bundled with typescript
```

### Python (`pylsp`)

```bash
pip install python-lsp-server
```

The skills use semantic tokens and go-to-definition requests — any LSP server that supports `textDocument/semanticTokens` and `textDocument/definition` will work.

## Architecture: The Provider Pattern

Each skill accepts a **Provider** object you implement. The provider connects the skill to your LSP client:

```ts
import { buildDefTree, TokenProvider } from "~/.lsprag-skills/src/treeCore.js";

const provider: TokenProvider = {
  // Open a document and return its text
  openDocument: async (uri) => ({
    uri,
    languageId: "typescript",
    getText: () => fs.readFileSync(new URL(uri).pathname, "utf8"),
  }),
  // Return document symbols (from LSP textDocument/documentSymbol)
  getDocumentSymbols: async (uri) => lspClient.documentSymbols(uri),
  // Return go-to-definition results (from LSP textDocument/definition)
  getDefinitions: async (doc, pos) => lspClient.definition(doc.uri, pos),
  // Return semantic tokens (from LSP textDocument/semanticTokens/range)
  getSemanticTokensRange: async (doc, range) => lspClient.semanticTokensRange(doc.uri, range),
  getSemanticTokensLegendRange: async (doc, range) => lspClient.semanticTokensLegend(doc.uri, range),
};

const tree = await buildDefTree(document, symbol, provider, 3);
```

The CLI scripts in `scripts/` and the OpenCode tool in `tools/` include self-contained provider implementations you can read and adapt.

## Tests

```bash
# Core logic tests (no LSP server needed)
npm test

# OpenCode integration smoke test (requires opencode CLI)
npm run test:opencode
```

## Repository Layout

```
src/         portable TypeScript core modules
skills/      skill descriptors for agent runtimes
tools/       ready-to-deploy OpenCode tool files
scripts/     CLI wrappers (run with tsx)
tests/       core unit tests + OpenCode integration test
```

## Skill-Specific Docs

- `skills/lsprag-def-tree/SKILL.md`
- `skills/lsprag-reference-info/SKILL.md`
- `skills/lsprag-retrieve-defs/SKILL.md`
- `skills/lsprag-token-defs/SKILL.md`
