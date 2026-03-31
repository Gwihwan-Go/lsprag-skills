# lsprag-skills

Portable LSP analysis tools for AI agents — build definition trees, resolve symbol references, and decode semantic tokens from any codebase without VS Code.

## What Is This?

Four skills that let AI agents (Claude Code, OpenCode, etc.) analyze code using Language Server Protocol (LSP) data:

| Skill | What it does |
|-------|-------------|
| `lsprag-def-tree` | Build a call tree from a symbol (shows what functions a function calls, recursively) |
| `lsprag-reference-info` | Find all callers of a symbol across a codebase |
| `lsprag-retrieve-defs` | Resolve where each token in a symbol is defined |
| `lsprag-token-defs` | Extract tokens from a symbol and resolve their definitions in one call |

**No VS Code required.** The `lsprag-def-tree` skill runs fully offline with regex-based analysis. The others need a language server for cross-file accuracy.

## Prerequisites

- **Node.js 18+** and **npm** — [nodejs.org](https://nodejs.org/)
- **`tsx`** — TypeScript runner, installed automatically by `npm install` in this repo.
  If you need it globally: `npm install -g tsx`

## Quick Install

### Option A: Automated installer (recommended)

```bash
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
bash ~/.lsprag-skills/install.sh
# Then open a new terminal (or: source ~/.bashrc)
```

The installer runs `npm install`, sets `LSPRAG_SKILLS_ROOT`, adds a Claude Code alias, and configures OpenCode if detected.

### Option B: Manual setup

```bash
# 1. Clone to a fixed location (the skills reference this path)
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
cd ~/.lsprag-skills

# 2. Install dev dependencies (only tsx + typescript — no runtime deps)
npm install

# 3. Persist the env var so every terminal session can find the skills
echo 'export LSPRAG_SKILLS_ROOT=~/.lsprag-skills' >> ~/.bashrc
source ~/.bashrc   # or open a new terminal

# 4. Verify it works
npx tsx scripts/def-tree-cli.ts \
  --file tests/fixtures/def-tree-sample.ts \
  --symbol foo
```

Expected output:
```
foo
└─ bar : bar
   └─ baz : baz
```

## Install for Claude Code

The repo ships a valid Claude Code plugin in `.claude-plugin/plugin.json`.

### Option A: Shell alias (recommended — loads every session)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
alias claude='claude --plugin-dir $LSPRAG_SKILLS_ROOT'
```

Then open a new terminal (or run `source ~/.bashrc`) and start Claude Code normally — skills load every session automatically.

### Option B: Use once with `--plugin-dir`

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
claude --plugin-dir ~/.lsprag-skills
```

### Option C: Install persistently via plugin command

```bash
# Register the GitHub repo as a plugin source
claude plugin marketplace add Gwihwan-Go/lsprag-skills

# Install the plugin
claude plugin install lsprag-skills
```

After install, set the env var in your shell rc so skills can run:

```bash
echo 'export LSPRAG_SKILLS_ROOT=~/.lsprag-skills' >> ~/.bashrc
source ~/.bashrc
```

### Using the Skills in Claude Code

Once installed, invoke with `/`:

```
/lsprag-def-tree --file src/server.ts --symbol handleRequest --depth 3
```

Or let Claude detect when to use them automatically — just describe what you want:

```
Show me the call tree for handleRequest in src/server.ts
```

## Install for OpenCode

Copy the tool file to OpenCode's tools directory:

```bash
mkdir -p ~/.config/opencode/tools

# The tool needs @opencode-ai/plugin (OpenCode may include this already;
# install manually if the tool fails to load)
npm install --prefix ~/.config/opencode @opencode-ai/plugin

# Copy the tool wrapper
cp ~/.lsprag-skills/tools/lsprag_def_tree.ts ~/.config/opencode/tools/

# Make sure LSPRAG_SKILLS_ROOT is set (add to ~/.bashrc if not already done)
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

Restart OpenCode — the `lsprag_def_tree` tool appears automatically.

**Test it from a prompt:**
```
Use lsprag_def_tree to show me the call tree for the foo function in
$HOME/.lsprag-skills/tests/fixtures/def-tree-sample.ts
```

## Use CLI Scripts Directly

The `scripts/` directory has standalone CLI wrappers (no agent needed):

```bash
# TypeScript / JavaScript
npx tsx $LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts \
  --file /path/to/source.ts \
  --symbol myFunction \
  --depth 3

# Go
npx tsx $LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts \
  --file /path/to/source.go \
  --symbol MyFunc
```

Claude Code agents can use these via the **Bash tool** — no plugin setup needed.

## LSP Server Setup (for cross-file analysis)

`lsprag-def-tree` works without an LSP server (regex mode). The other skills (`reference-info`, `retrieve-defs`, `token-defs`) need one.

### Go

```bash
go install golang.org/x/tools/gopls@latest
```

Auto-detect or install:

```bash
gopls_path="$(~/.lsprag-skills/scripts/ensure-gopls.sh)"
```

### TypeScript

```bash
npm install -g typescript
# tsserver is included with typescript
```

### Python

```bash
pip install python-lsp-server
```

## Architecture: The Provider Pattern

Each skill accepts a **Provider** you implement that connects it to your LSP client. The CLI scripts and OpenCode tool include self-contained providers you can use as templates:

```ts
// Use an absolute path or process.env.LSPRAG_SKILLS_ROOT
import { buildDefTree } from "/path/to/lsprag-skills/src/treeCore.js";
import type { TokenProvider } from "/path/to/lsprag-skills/src/tokenCore.js";

const provider: TokenProvider = {
  openDocument: async (uri) => ({ uri, languageId: "typescript", getText: () => fs.readFileSync(...) }),
  getDocumentSymbols: async (uri) => lspClient.documentSymbols(uri),
  getDefinitions: async (doc, pos) => lspClient.definition(doc.uri, pos),
  getSemanticTokensRange: async (doc, range) => lspClient.semanticTokensRange(doc.uri, range),
  getSemanticTokensLegendRange: async (doc, range) => lspClient.semanticTokensLegend(doc.uri, range),
};

const tree = await buildDefTree(document, symbol, provider, 3);
```

## Tests

```bash
# Core logic + CLI tests (no LSP server needed)
npm test

# OpenCode integration smoke test (requires opencode CLI)
npm run test:opencode
```

## Repository Layout

```
src/           portable TypeScript core modules
skills/        skill descriptors for Claude Code and other agents
  lsprag-def-tree/
  lsprag-reference-info/
  lsprag-retrieve-defs/
  lsprag-token-defs/
tools/         ready-to-deploy OpenCode tool files
scripts/       CLI wrappers (run with tsx)
tests/         unit tests + integration tests
.claude-plugin/ Claude Code plugin manifest
```

## Skill Docs

- `skills/lsprag-def-tree/SKILL.md`
- `skills/lsprag-reference-info/SKILL.md`
- `skills/lsprag-retrieve-defs/SKILL.md`
- `skills/lsprag-token-defs/SKILL.md`
