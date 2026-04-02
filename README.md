# lsprag-skills

Portable LSP code analysis for AI agents — retrieve source, trace dependencies, and deep-expand call graphs.

## What Is This?

A set of `lsprag` skills that give AI agents (Claude Code, OpenCode, etc.) a `lsprag` CLI for semantic code analysis:

| Command | What it does |
|---------|-------------|
| `lsprag def-tree` | Temporarily disabled |
| `lsprag retrieve-def` | Get the full source of any symbol, by name or by call-site location |
| `lsprag token-defs` | Decompose a symbol into tokens and show where each is defined |
| `lsprag token-analysis` | Token-defs analysis mode: markdown links + definition source blocks |
| `lsprag deep-think` | BFS expansion: retrieve source + deps for a symbol and all its transitive dependencies |

**No VS Code required.** `retrieve-def` and `deep-think` work without an external LSP server.  
`token-defs` and `token-analysis` are LSP-only; if LSP is unavailable, use shell tools (`ls`, `rg`) for manual tracing.

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
echo 'export LSPRAG_LSP_PROVIDER=~/.lsprag-skills/providers/your-lsp-provider.mjs' >> ~/.bashrc
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

bash scripts/update.sh
```

### Verify

```bash
lsprag --help
lsprag retrieve-def --file "$LSPRAG_SKILLS_ROOT/tests/fixtures/def-tree-sample.ts" --symbol foo
```

## CLI Usage

### def-tree — Temporarily Disabled

`lsprag def-tree` is currently disabled.
Use `lsprag token-analysis` or `lsprag deep-think` for dependency understanding.

### retrieve-def — Full Source of Symbol Definitions

By name:

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody
# multi-symbol (comma-separated or repeated flag):
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody,readStream
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody --symbol readStream
```

By call-site location (go-to-definition — 1-indexed line:col):

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --location 42:15
```

By line range (load all unique definitions referenced in a line slice):

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --line-range 120:180
# optional symbol filter:
lsprag retrieve-def --file "$(realpath src/server.ts)" --line-range 120:180 --symbol parseBody,readStream
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

Optional analysis mode with definition source expansion:

```bash
lsprag token-defs --file "$(realpath src/server.ts)" --symbol handleRequest --full-source --format markdown
# or shortcut:
lsprag token-analysis --file "$(realpath src/server.ts)" --symbol handleRequest
# optional: restrict token rows to a line slice inside the symbol body
lsprag token-analysis --file "$(realpath src/server.ts)" --symbol handleRequest --line-range 20:60
```

This prints:
- full symbol source with inline token markers: `<<Tn:token>>`
- token summary table:
  - Token
  - Symbol Type (LSP SymbolKind)
  - Lines of Symbols
- `lsprag retrieve-def` instruction for each dependency
- recursive guidance for follow-up `retrieve-def` and `token-analysis` calls

LSP policy:
- `token-defs` / `token-analysis` require `LSPRAG_LSP_PROVIDER` (or `LSPRAG_PROVIDER_PATH`)
- if LSP is unavailable, use shell tools directly:
  - `ls -la <directory>`
  - `rg -n "<symbol>" <file>`

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
| What does function X call? | `lsprag deep-think --depth <n>` |
| Read one or more symbol definitions | `lsprag retrieve-def --symbol <a,b,...>` |
| Jump to definition from a call site | `lsprag retrieve-def --location <line>:<col>` |
| Load all definitions used in specific lines | `lsprag retrieve-def --line-range <start:end>` |
| What identifiers does a function depend on? | `lsprag token-defs` |
| Get dependency map + definition sources (linked) | `lsprag token-analysis` |
| Understand a complex function before writing tests or refactoring | `lsprag deep-think` |
| Quick text search | `rg -n <name> .` |

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
Show me all definitions used in lines 120:180 of src/server.ts
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

For `token-defs` / `token-analysis`, install an LSP server and set `LSPRAG_LSP_PROVIDER`. If LSP is unavailable, use `ls`/`rg` manually.

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
  def-tree-cli.ts      temporarily disabled
  retrieve-def-cli.ts  retrieve a symbol's full source
  token-defs-cli.ts    decompose a symbol into token dependencies
  deep-think-cli.ts    BFS expansion across all transitive dependencies
  update.sh            verify/repair installation
skills/
  lsprag/              Claude Code skill (retrieve-def, token-defs)
    SKILL.md
  lsprag-deep-think/   Claude Code skill (deep-think)
    SKILL.md
src/                   portable TypeScript core modules
providers/
  (optional custom LSP provider modules)
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
npm run test:opencode    # OpenCode integration (def-tree coverage; currently disabled in runtime CLI)
```
