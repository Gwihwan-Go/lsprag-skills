---
name: lsprag
description: Semantic code analysis for AI agents — retrieve definitions, analyze token dependencies, and expand dependency layers across TypeScript, JavaScript, Go, and Python. Use when asked to trace dependencies or analyze code structure before editing. Note: `def-tree` is temporarily disabled.
license: LICENSE
---

# LSPRAG — Code Analysis

## IMPORTANT: PREREQUISITE

Before using this skill, verify the installation:

```bash
bash "$LSPRAG_SKILLS_ROOT/scripts/update.sh"
```

Confirm the CLI is available:

```bash
lsprag --help
```

If `lsprag` is not found, add `~/.local/bin` to your PATH and retry:

```bash
export PATH="$HOME/.local/bin:$PATH"
lsprag --help
```

**IF THE CLI IS NOT WORKING, DO NOT PROCEED. Ask the user to run the installer first.**

Optional: install LSP servers (recommended for cross-file accuracy):

```bash
LSPRAG_INSTALL_LSP=1 bash "$LSPRAG_SKILLS_ROOT/install.sh"
```

Manual install:

```bash
# Go (gopls)
sudo apt-get update
sudo apt-get install -y gopls
# or
GOBIN="$HOME/.local/bin" GOPATH="$HOME/.local/go" go install golang.org/x/tools/gopls@latest

# TypeScript (tsserver)
npm install -g typescript --prefix "$HOME/.local"

# Python (pylsp)
python3 -m venv ~/.local/lsprag-pylsp-venv
~/.local/lsprag-pylsp-venv/bin/pip install python-lsp-server
ln -sf ~/.local/lsprag-pylsp-venv/bin/pylsp ~/.local/bin/pylsp
```

## Overview

`lsprag` is a code analysis CLI for definition lookup and dependency analysis.

- **LSP-first for token analysis**: `token-defs` / `token-analysis` require `LSPRAG_LSP_PROVIDER`. If unavailable, use shell tools (`ls`, `rg`) for manual tracing.
- **Supported languages**: TypeScript, JavaScript (`.ts`, `.js`), Go (`.go`), Python (`.py`)

## Tool Selection

| Task | Traditional approach | lsprag |
|------|----------------------|--------|
| What does function X call? | `grep` + manual tracing | `lsprag deep-think --file <f> --symbol <name> --depth <n>` |
| Read a function's full source | `Read` or `grep` for body | `lsprag retrieve-def --file <f> --symbol <name>` |
| Jump to definition from a call site | (open file manually) | `lsprag retrieve-def --file <f> --location <line>:<col>` |
| Load all definitions in a line slice | inspect each line manually | `lsprag retrieve-def --file <f> --line-range <start:end>` |
| What does a function depend on? | Read and trace manually | `lsprag token-defs --file <f> --symbol <name>` |
| Quick text search | _(still appropriate)_ | `rg -n <name> .` |

Prefer `lsprag` commands over `grep + Read` when the goal is understanding code structure or dependencies.

## Commands

### def-tree: Temporarily Disabled

`lsprag def-tree` is temporarily disabled.
Use `lsprag deep-think` for layered dependency traversal.

---

### retrieve-def: Get Symbol Definition Source

Return the complete source code of a symbol's definition.

**By name** — finds one or more symbol definitions directly in the file:

```bash
lsprag retrieve-def --file <absolute_path> --symbol <name[,name2,...]>
# or repeat --symbol:
lsprag retrieve-def --file <absolute_path> --symbol <name> --symbol <name2>
```

**By location** — "go-to-definition": resolves the symbol at a given line/column (useful when reading a call site):

```bash
lsprag retrieve-def --file <absolute_path> --location <line>:<col>
```

**By line range** — resolves all unique symbol definitions used in a line slice (1-indexed, inclusive):

```bash
lsprag retrieve-def --file <absolute_path> --line-range <start:end>
# optional filter:
lsprag retrieve-def --file <absolute_path> --line-range <start:end> --symbol <name[,name2,...]>
```

`--location` accepts 1-indexed line and column (matching editor line numbers).

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Symbol name(s), comma-separated or repeated flag | No (required when no `--location` and no `--line-range`) |
| `--location` | `<line>:<col>` of a usage site (1-indexed) | No |
| `--line-range` | `<start:end>` inclusive lines to scan for symbol usages | No |

**Example — get a function body:**

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol handleRequest
```

```
# handleRequest (src/server.ts:15:10)
function handleRequest(req, res) {
  const body = parseBody(req);
  sendResponse(res, formatJSON(body));
}
```

**Example — go to definition of a call at a specific location:**

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --location 18:15
```

Returns the full source of `parseBody` as defined (possibly in another file if using a real LSP provider).

**Example — load all definitions referenced in a range:**

```bash
lsprag retrieve-def --file "$(realpath src/server.ts)" --line-range 120:180
```

This prints each resolved definition once.

---

### token-defs: Decompose a Symbol into Tokens + Definitions

List every identifier token within a symbol body and show where each is defined. Useful for understanding what a function depends on.

`token-defs` and `token-analysis` are **LSP-only**. Set `LSPRAG_LSP_PROVIDER` (or `LSPRAG_PROVIDER_PATH`) to a valid provider module.

```bash
lsprag token-defs --file <absolute_path> --symbol <name>
# optional: restrict output rows to token lines in a sub-range
lsprag token-defs --file <absolute_path> --symbol <name> --line-range <start:end>
# analysis mode:
lsprag token-analysis --file <absolute_path> --symbol <name> --line-range <start:end>
```

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Function or method name to analyze | Yes |

**Example output:**

```
Tokens in 'handleRequest' (src/server.ts:15:10):

  L  16:C  7  parseBody    ->  src/server.ts:42:10
  L  17:C  3  sendResponse ->  src/response.ts:8:10
  L  17:C 16  formatJSON   ->  src/format.ts:3:10
```

Each row shows: location inside the function → token name → definition location.

Only tokens with resolved definitions are shown. If LSP is unavailable, use shell tools such as `ls -la` and `rg -n`.

## Best Practices

### Understanding What a Function Does

```bash
# Step 1: see what tokens it depends on
lsprag token-defs --file "$(realpath src/server.ts)" --symbol handleRequest

# Step 2: read the body of a key dependency
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody

# Step 3: expand dependency layers if needed
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 2
```

**Why**: start with structure before loading file content — it shows you what matters.

### Before Modifying a Function

```bash
# See all dependencies it references
lsprag token-defs --file "$(realpath src/server.ts)" --symbol targetFunction

# Optionally expand transitive dependencies
lsprag deep-think --file "$(realpath src/server.ts)" --symbol targetFunction --depth 3

# Find callers
rg -n "targetFunction" .
```

### Reading a Definition from a Call Site

```bash
# You see a call to parseBody() on line 42, col 15 — get its full source:
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody --location 42:15
```

### Exploring an Unfamiliar Codebase

```bash
# See direct dependencies
lsprag token-defs --file "$(realpath src/main.ts)" --symbol main

# Expand dependencies by layers
lsprag deep-think --file "$(realpath src/main.ts)" --symbol main --depth 3
```

### Go Codebases

```bash
lsprag retrieve-def --file "$(realpath main.go)" --symbol HandleRequest
lsprag token-defs   --file "$(realpath main.go)" --symbol HandleRequest
lsprag deep-think   --file "$(realpath main.go)" --symbol HandleRequest --depth 2
```

## Notes

- Regex mode analyzes only the given file. For cross-file resolution, configure `LSPRAG_LSP_PROVIDER`.
- Arrow functions and class methods are detected in TypeScript/JavaScript.
- `def-tree` is temporarily disabled.
