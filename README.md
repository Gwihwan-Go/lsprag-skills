# lsprag-skills

Portable LSP code analysis for AI agents — build definition trees, retrieve source, trace dependencies, and deep-expand call graphs. Works offline with no VS Code required.

## What Is This?

A set of `lsprag` skills that give AI agents (Claude Code, OpenCode, etc.) a `lsprag` CLI for semantic code analysis:

| Command | What it does |
|---------|-------------|
| `lsprag def-tree` | Build a call tree from a function (what does it call, recursively?) |
| `lsprag retrieve-def` | Get the full source of any symbol, by name or by call-site location |
| `lsprag token-defs` | Decompose a symbol into tokens and show where each is defined |
| `lsprag deep-think` | BFS expansion: retrieve source + deps for a symbol and all its transitive dependencies |

**No VS Code required.** Works offline with regex-based analysis. Plug in a real LSP server (`gopls`, `tsserver`, `pylsp`) for cross-file accuracy.

**Supported languages:** TypeScript, JavaScript, Go, Python

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

### Option B: Manual

```bash
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
cd ~/.lsprag-skills
npm install

echo 'export LSPRAG_SKILLS_ROOT=~/.lsprag-skills' >> ~/.bashrc
echo 'export LSPRAG_LSP_PROVIDER=~/.lsprag-skills/providers/regex-provider.mjs' >> ~/.bashrc
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

bash scripts/update.sh
```

### Verify

```bash
lsprag --help
lsprag def-tree --file "$LSPRAG_SKILLS_ROOT/tests/fixtures/def-tree-sample.ts" --symbol foo
```

## CLI Usage

### def-tree — Call Tree

What does a function call, recursively?

```bash
lsprag def-tree --file "$(realpath src/server.ts)" --symbol handleRequest --depth 3
```

```
handleRequest
├─ parseBody
│  └─ readStream
└─ sendResponse
   └─ formatJSON
```

### retrieve-def — Full Source of a Symbol

By name:

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody
```

By call-site location (go-to-definition — 1-indexed line:col):

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody --location 42:15
```

Output:

```
# parseBody (src/server.ts:30:10)
function parseBody(req) {
  return JSON.parse(req.body);
}
```

### token-defs — Token Dependency Map

List every identifier token inside a function and show where it's defined:

```bash
lsprag token-defs --file "$(realpath src/server.ts)" --symbol handleRequest
```

```
Tokens in 'handleRequest' (src/server.ts:15:10):

  L  16:C  7  parseBody    ->  src/server.ts:30:10
  L  17:C  3  sendResponse ->  src/server.ts:58:10
  L  17:C 16  formatJSON   ->  src/format.ts:3:10
```

### deep-think — BFS Dependency Expansion

High-effort code understanding: recursively retrieve the source and dependencies of every symbol a function touches, layer by layer.

```bash
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 2
```

```
# Deep Think: 'handleRequest' (max depth: 2)

## Level 0: handleRequest (src/server.ts:15:10)
\`\`\`
function handleRequest(req, res) {
  const body = parseBody(req);
  sendResponse(res, formatJSON(body));
}
\`\`\`
Dependencies:
  L  16:C  7  parseBody    ->  src/server.ts:30:10
  L  17:C  3  sendResponse ->  src/server.ts:58:10

---

## Level 1: parseBody (src/server.ts:30:10)
\`\`\`
function parseBody(req) { ... }
\`\`\`
...
```

Start at `--depth 1` for initial exploration; increase for deeper understanding.

## Tool Selection Guide

| Goal | Use |
|------|-----|
| What does function X call? | `lsprag def-tree` |
| Read a function's full source | `lsprag retrieve-def` |
| Jump to definition from a call site | `lsprag retrieve-def --location <line>:<col>` |
| What identifiers does a function depend on? | `lsprag token-defs` |
| Understand a complex function before writing tests or refactoring | `lsprag deep-think` |
| Quick text search | `grep -rn <name> . --include="*.ts"` |

## Install for Claude Code

The repo ships a Claude Code marketplace manifest in `.claude-plugin/marketplace.json`.

### Option A: Shell alias (loads every session)

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
alias claude='claude --plugin-dir $LSPRAG_SKILLS_ROOT'
```

### Option B: Use once

```bash
claude --plugin-dir ~/.lsprag-skills
```

### Option C: Install via plugin command

```bash
claude plugin marketplace add Gwihwan-Go/lsprag-skills
claude plugin install lsprag
```

Once installed, Claude invokes `lsprag` automatically when you describe code analysis tasks:

```
Show me the call tree for handleRequest in src/server.ts
Understand everything handleRequest depends on before I refactor it
```

## Install for OpenCode

```bash
mkdir -p ~/.config/opencode/tools
cp ~/.lsprag-skills/tools/lsprag_def_tree.ts ~/.config/opencode/tools/
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

Restart OpenCode — the `lsprag_def_tree` tool appears automatically.

## LSP Server Setup (for cross-file analysis)

All commands work offline in regex mode (same-file only). For cross-file accuracy, install an LSP server and set `LSPRAG_LSP_PROVIDER`.

**Go (gopls)**:
```bash
sudo apt-get install -y gopls
# or: GOBIN="$HOME/.local/bin" go install golang.org/x/tools/gopls@latest
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

## Repository Layout

```
scripts/
  lsprag               shell wrapper — the installed CLI
  def-tree-cli.ts      build a call tree
  retrieve-def-cli.ts  retrieve a symbol's full source
  token-defs-cli.ts    decompose a symbol into token dependencies
  deep-think-cli.ts    BFS expansion across all transitive dependencies
  update.sh            verify/repair installation
skills/
  lsprag/              Claude Code skill (def-tree, retrieve-def, token-defs)
    SKILL.md
  lsprag-deep-think/   Claude Code skill (deep-think)
    SKILL.md
src/                   portable TypeScript core modules
providers/
  regex-provider.mjs   offline regex-based provider (default)
tools/                 OpenCode tool wrappers
tests/
  cli.test.ts          end-to-end CLI tests (all commands, TS + Go fixtures)
  fixtures/            sample source files used by tests
.claude-plugin/
  marketplace.json     Claude Code marketplace manifest
```

## Verify / Update

Run anytime to check and repair the installation:

```bash
bash $LSPRAG_SKILLS_ROOT/scripts/update.sh
```

## Tests

```bash
npm test                 # all CLI tests (no LSP server needed)
npm run test:opencode    # OpenCode integration (requires opencode CLI)
```
