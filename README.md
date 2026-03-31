# lsprag-skills

Portable LSP code analysis for AI agents — build definition trees, trace call chains, and analyze code without VS Code.

## What Is This?

A single `lsprag` skill that gives AI agents (Claude Code, OpenCode, etc.) the `lsprag` CLI for semantic code analysis:

| Command | What it does |
|---------|-------------|
| `lsprag def-tree` | Build a call tree from a function (shows what it calls, recursively) |

**No VS Code required.** Works offline with regex-based analysis. Plug in a real LSP server (`gopls`, `tsserver`, `pylsp`) for cross-file accuracy.

## Prerequisites

- **Node.js 18+** and **npm** — [nodejs.org](https://nodejs.org/)
- `tsx` is installed by `npm install` in this repo (no global install needed)

## Quick Install

### Option A: Automated installer (recommended)

```bash
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
bash ~/.lsprag-skills/install.sh
# Then open a new terminal (or: source ~/.bashrc)
```

The installer: runs `npm install`, sets env vars, symlinks `lsprag` to `~/.local/bin/lsprag`, configures Claude Code, and sets up OpenCode if detected.

Optional: install LSP servers automatically (Go/TypeScript/Python):

```bash
LSPRAG_INSTALL_LSP=1 bash ~/.lsprag-skills/install.sh
```

If you already ran the installer, rerun it with `LSPRAG_INSTALL_LSP=1`.

### Option B: Manual

```bash
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
cd ~/.lsprag-skills
npm install

# Set env vars
echo 'export LSPRAG_SKILLS_ROOT=~/.lsprag-skills' >> ~/.bashrc
echo 'export LSPRAG_LSP_PROVIDER=~/.lsprag-skills/providers/regex-provider.mjs' >> ~/.bashrc
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Install the lsprag CLI
bash scripts/update.sh
```

### Verify

```bash
lsprag def-tree \
  --file $LSPRAG_SKILLS_ROOT/tests/fixtures/def-tree-sample.ts \
  --symbol foo
```

Expected output:
```
foo
└─ bar : bar
   └─ baz : baz
```

## Install for Claude Code

The repo ships a Claude Code marketplace manifest in `.claude-plugin/marketplace.json`.

### Option A: Shell alias (recommended — loads every session)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
alias claude='claude --plugin-dir $LSPRAG_SKILLS_ROOT'
```

Then open a new terminal and run `claude` — the `lsprag` skill loads automatically.

### Option B: Use once

```bash
claude --plugin-dir ~/.lsprag-skills
```

### Option C: Install via plugin command

```bash
claude plugin marketplace add Gwihwan-Go/lsprag-skills
claude plugin install lsprag
```

### Using the skill in Claude Code

```
/lsprag def-tree --file src/server.ts --symbol handleRequest
```

Or just describe what you want — Claude invokes it automatically:

```
Show me the call tree for handleRequest in src/server.ts
```

## Install for OpenCode

```bash
mkdir -p ~/.config/opencode/tools
npm install --prefix ~/.config/opencode @opencode-ai/plugin  # if not already installed
cp ~/.lsprag-skills/tools/lsprag_def_tree.ts ~/.config/opencode/tools/
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

Restart OpenCode — the `lsprag_def_tree` tool appears automatically.

## CLI Usage (no agent needed)

```bash
# TypeScript / JavaScript
lsprag def-tree --file /path/to/source.ts --symbol myFunction --depth 3

# Go
lsprag def-tree --file /path/to/main.go --symbol MyFunc

# Always use absolute paths (convert with realpath if needed)
lsprag def-tree --file "$(realpath src/server.ts)" --symbol handleRequest
```

## LSP Server Setup (for cross-file analysis)

`lsprag def-tree` works without an LSP server (regex mode). For cross-file accuracy, install LSP servers and set an LSP provider module.

**Go (gopls)**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y gopls

# or via Go toolchain
GOBIN="$HOME/.local/bin" GOPATH="$HOME/.local/go" go install golang.org/x/tools/gopls@latest
```

**TypeScript (tsserver)**:
```bash
npm install -g typescript --prefix "$HOME/.local"
```

**Python (pylsp)**:
```bash
python3 -m venv ~/.local/lsprag-pylsp-venv
~/.local/lsprag-pylsp-venv/bin/pip install python-lsp-server
ln -sf ~/.local/lsprag-pylsp-venv/bin/pylsp ~/.local/bin/pylsp
```

If you install to `~/.local/bin`, make sure it is on your `PATH`.

## Repository Layout

```
scripts/
  lsprag            shell wrapper — the installed CLI
  def-tree-cli.ts   TypeScript implementation (called by lsprag)
  update.sh         verify/repair installation
  ensure-gopls.sh   Go LSP installer helper
skills/
  lsprag/           Claude Code skill definition
    SKILL.md        skill instructions for AI agents
    references/     additional guides
src/                portable TypeScript core modules
providers/
  regex-provider.mjs  offline regex-based provider (default)
tools/              OpenCode tool wrappers
tests/              unit tests + integration tests
.claude-plugin/
  marketplace.json  Claude Code marketplace manifest
```

## Verify / Update

Run anytime to check and repair the installation:

```bash
bash $LSPRAG_SKILLS_ROOT/scripts/update.sh
```

## Tests

```bash
npm test                    # core logic + CLI tests (no LSP server needed)
npm run test:opencode       # OpenCode integration (requires opencode CLI)
```
