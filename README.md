# lsprag-skills

Portable LSP code analysis for AI agents — build definition trees, retrieve source, trace dependencies, and deep-expand call graphs. Uses real language servers (no VS Code required).

## What Is This?

A set of `lsprag` skills that give AI agents (Claude Code, OpenCode, etc.) a `lsprag` CLI for semantic code analysis:

| Command | What it does |
|---------|-------------|
| `lsprag listSymbols` | List all functions, classes, and symbols in a file |
| `lsprag getDefinition` | Get the full source of a symbol, or hover info for variables/constants |
| `lsprag getTokens` | Decompose a symbol into tokens and show where each is defined |
| `lsprag getReference` | Find all callers / usages of a symbol |
| `lsprag callChain` | Trace incoming call chain (who calls this, recursively) |
| `lsprag deep-think` | BFS expansion: retrieve source + deps for a symbol and all its transitive dependencies |

**Supported languages:** TypeScript, JavaScript, Go, Python

## Prerequisites

- **Node.js** >= 20 and **npm** (required)
- **Go** (if analyzing Go code — needed to install `gopls`)
- **Python 3** + **pip** (if analyzing Python code — needed to install `pylsp`)

## Install

```bash
git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills
bash ~/.lsprag-skills/install.sh
```

Then **open a new terminal** (or run `source ~/.bashrc` / `source ~/.zshrc`).

Confirm it works:

```bash
lsprag --version
```

The installer handles everything in one step:
1. Installs npm dependencies
2. Creates the `lsprag` CLI symlink at `~/.local/bin/lsprag`
3. Sets environment variables (`LSPRAG_SKILLS_ROOT`, `LSPRAG_LSP_PROVIDER`)
4. Installs LSP servers for detected languages:
   - **TypeScript/JavaScript**: `typescript-language-server` (via npm)
   - **Go**: `gopls` (via `go install`)
   - **Python**: `pylsp` (via pip)
5. Configures Claude Code / OpenCode (if present)

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

### listSymbols — File Overview

```bash
lsprag listSymbols --file "$(realpath src/server.ts)"
```

```
Symbols in src/server.ts:

Functions:
  handleRequest                             L3 (12 lines)
  parseBody                                 L30 (8 lines)

Constants:
  MAX_RETRIES                               L1 (1 lines)
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

```bash
lsprag getReference --file "$(realpath src/server.ts)" --symbol handleRequest
```

### callChain — Trace Incoming Call Chain

```bash
lsprag callChain --file "$(realpath src/server.ts)" --symbol handleRequest
```

```
Incoming calls to 'handleRequest':
handleRequest (src/server.ts:3)
└─ routeRequest (src/router.ts:15)
   └─ main (src/index.ts:8)
```

### deep-think — Breadth-First Dependency Expansion

```bash
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 2
```

Start at `--depth 1` for initial exploration; increase for deeper understanding.

## Tool Selection Guide

| Goal | Use |
|------|-----|
| What's in this file? | `lsprag listSymbols` |
| Read a function's full source | `lsprag getDefinition` |
| Inspect a constant or variable | `lsprag getDefinition` (hover mode) |
| Jump to definition from a call site | `lsprag getDefinition --location <line>:<col>` |
| What identifiers does a function depend on? | `lsprag getTokens` |
| Who calls this function? | `lsprag getReference` or `lsprag callChain` |
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
  list-symbols-cli.ts     list all symbols in a file
  get-reference-cli.ts    find all callers / usages
  call-hierarchy-cli.ts   incoming/outgoing call hierarchy (also powers callChain)
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
  lsp-client.ts            LSP client provider (spawns real language servers)
tools/                    OpenCode tool wrappers
tests/                    test suite
```

## Tests

```bash
npm test                 # all tests (requires LSP servers: typescript-language-server, gopls)
npm run test:opencode    # OpenCode integration (requires opencode CLI)
```
