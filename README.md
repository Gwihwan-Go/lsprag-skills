# lsprag-skills

Portable LSP code analysis for AI agents — build definition trees, retrieve source, trace dependencies, and deep-expand call graphs. Works offline with no VS Code required.

## What Is This?

A set of `lsprag` skills that give AI agents (Claude Code, OpenCode, etc.) a `lsprag` CLI for semantic code analysis:

| Command | What it does |
|---------|-------------|
| `lsprag def-tree` | Build a call tree from a function (what does it call, recursively?) |
| `lsprag getDefinition` | Get the full source of a symbol, or hover info for variables/constants |
| `lsprag getTokens` | Decompose a symbol into tokens and show where each is defined |
| `lsprag getReference` | Find all callers / usages of a symbol (requires LSP) |
| `lsprag deep-think` | BFS expansion: retrieve source + deps for a symbol and all its transitive dependencies |

**Supported languages:** TypeScript, JavaScript, Go, Python

## Install

```bash
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
bash ~/.lsprag-skills/install.sh
```

Then open a new terminal (or `source ~/.bashrc`).

The installer handles everything in one step:
- npm dependencies
- `lsprag` CLI symlink to `~/.local/bin`
- Environment variables (`LSPRAG_SKILLS_ROOT`, `LSPRAG_LSP_PROVIDER`)
- LSP servers for detected languages (gopls, tsserver, pylsp)
- Claude Code / OpenCode configuration (if present)

### Install individual LSP servers

If you skipped a language or need to add one later:

```bash
bash ~/.lsprag-skills/scripts/install-lsp-go.sh      # gopls
bash ~/.lsprag-skills/scripts/install-lsp-ts.sh      # tsserver
bash ~/.lsprag-skills/scripts/install-lsp-python.sh  # pylsp
```

### Verify

```bash
bash ~/.lsprag-skills/scripts/update.sh
```

This checks (but never installs) that everything is in place.

## CLI Usage

### def-tree — Call Tree

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

### getDefinition — Full Source or Type Info

Functions get full source; variables/constants get hover type info.

```bash
lsprag getDefinition --file "$(realpath src/server.ts)" --symbol handleRequest
lsprag getDefinition --file "$(realpath src/config.ts)" --symbol MAX_RETRIES
```

By call-site location (1-indexed line:col):

```bash
lsprag getDefinition --file "$(realpath src/server.ts)" --symbol parseBody --location 42:15
```

### getTokens — Token Dependency Map

```bash
lsprag getTokens --file "$(realpath src/server.ts)" --symbol handleRequest
```

```
Tokens in 'handleRequest' (src/server.ts:15:10):

  L  16:C  7  parseBody    ->  src/server.ts:30:10
  L  17:C  3  sendResponse ->  src/server.ts:58:10
  L  17:C 16  formatJSON   ->  src/format.ts:3:10
```

### getReference — Find All Callers

Requires LSP — exits with an error if `LSPRAG_LSP_PROVIDER` is not set.

```bash
lsprag getReference --file "$(realpath src/server.ts)" --symbol handleRequest
```

### deep-think — BFS Dependency Expansion

```bash
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 2
```

Start at `--depth 1` for initial exploration; increase for deeper understanding.

## Tool Selection Guide

| Goal | Use |
|------|-----|
| What does function X call? | `lsprag def-tree` |
| Read a function's full source | `lsprag getDefinition` |
| Inspect a constant or variable | `lsprag getDefinition` (hover mode) |
| Jump to definition from a call site | `lsprag getDefinition --location <line>:<col>` |
| What identifiers does a function depend on? | `lsprag getTokens` |
| Who calls this function? | `lsprag getReference` |
| Understand a complex function deeply | `lsprag deep-think` |
| Quick text search | `grep -rn <name> . --include="*.ts"` |

## Install for Claude Code

### Option A: Shell alias (loads every session)

```bash
alias claude='claude --plugin-dir ~/.lsprag-skills'
```

### Option B: Use once

```bash
claude --plugin-dir ~/.lsprag-skills
```

Once installed, Claude invokes `lsprag` automatically when you describe code analysis tasks.

## Install for OpenCode

```bash
mkdir -p ~/.config/opencode/tools
cp ~/.lsprag-skills/tools/lsprag_def_tree.ts ~/.config/opencode/tools/
```

Restart OpenCode — the `lsprag_def_tree` tool appears automatically.

## Repository Layout

```
scripts/
  lsprag                  shell wrapper — the installed CLI
  get-definition-cli.ts   retrieve a symbol's full source or hover info
  get-tokens-cli.ts       decompose a symbol into token dependencies
  get-reference-cli.ts    find all callers / usages (requires LSP)
  def-tree-cli.ts         build a call tree
  deep-think-cli.ts       BFS expansion across transitive dependencies
  install-lsp-go.sh       install gopls
  install-lsp-ts.sh       install tsserver
  install-lsp-python.sh   install pylsp
  update.sh               verify installation (read-only)
skills/
  lsprag/                 Claude Code skill
    SKILL.md
  lsprag-deep-think/      Claude Code skill (deep-think)
    SKILL.md
src/                      portable TypeScript core modules
providers/
  regex-provider.mjs      offline regex-based provider (default)
tools/                    OpenCode tool wrappers
tests/                    test suite
```

## Tests

```bash
npm test                 # all tests (no LSP server needed)
npm run test:opencode    # OpenCode integration (requires opencode CLI)
```
