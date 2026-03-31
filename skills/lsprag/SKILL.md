---
name: lsprag
description: Semantic code analysis for AI agents — build definition trees, find callers, and map call chains across TypeScript, JavaScript, Go, and Python. Use when asked to understand what a function calls, trace dependencies, or analyze code structure before editing. Works offline with no LSP server required.
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

`lsprag` is a code analysis CLI. It analyzes source files to map function call trees and dependencies.

- **Offline-first**: Regex-based analysis works with no language server. Set `LSPRAG_LSP_PROVIDER` for cross-file LSP accuracy.
- **Supported languages**: TypeScript, JavaScript (`.ts`, `.js`), Go (`.go`), Python (`.py`)

## Tool Selection

| Task | Traditional approach | lsprag |
|------|----------------------|--------|
| What does function X call? | `grep` + manual tracing | `lsprag def-tree --file <f> --symbol <name>` |
| Read a function's full source | `Read` or `grep` for body | `lsprag retrieve-def --file <f> --symbol <name>` |
| Jump to definition from a call site | (open file manually) | `lsprag retrieve-def --file <f> --symbol <name> --location <line>:<col>` |
| What does a function depend on? | Read and trace manually | `lsprag token-defs --file <f> --symbol <name>` |
| Quick text search | _(still appropriate)_ | `grep -rn <name> . --include="*.ts"` |

Prefer `lsprag` commands over `grep + Read` when the goal is understanding code structure or dependencies.

## Commands

### def-tree: Build a Call Tree

Show which functions a symbol calls, recursively.

```bash
lsprag def-tree --file <absolute_path> --symbol <name> [--depth <n>]
```

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Function or method name | Yes |
| `--depth` | Max recursion depth (default: 3) | No |

**Always use absolute paths:**

```bash
lsprag def-tree --file "$(realpath src/server.ts)" --symbol handleRequest --depth 3
```

**Example output:**

```
handleRequest
├─ parseBody
│  └─ readStream
└─ sendResponse
   └─ formatJSON
```

If the symbol is not found, `lsprag` prints all detected symbols — use that list to find the correct name.

---

### retrieve-def: Get a Symbol's Full Source

Return the complete source code of a symbol's definition.

**By name** — finds the symbol definition directly in the file:

```bash
lsprag retrieve-def --file <absolute_path> --symbol <name>
```

**By location** — "go-to-definition": resolves the symbol at a given line/column (useful when reading a call site):

```bash
lsprag retrieve-def --file <absolute_path> --symbol <name> --location <line>:<col>
```

`--location` accepts 1-indexed line and column (matching editor line numbers).

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Symbol name to look up | Yes |
| `--location` | `<line>:<col>` of a usage site (1-indexed) | No |

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
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody --location 18:15
```

Returns the full source of `parseBody` as defined (possibly in another file if using a real LSP provider).

---

### token-defs: Decompose a Symbol into Tokens + Definitions

List every identifier token within a symbol body and show where each is defined. Useful for understanding what a function depends on.

```bash
lsprag token-defs --file <absolute_path> --symbol <name>
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

Only tokens with resolved definitions are shown. In regex mode, only same-file function definitions resolve; cross-file requires `LSPRAG_LSP_PROVIDER`.

## Best Practices

### Understanding What a Function Does

```bash
# Step 1: map the call tree
lsprag def-tree --file "$(realpath src/server.ts)" --symbol handleRequest

# Step 2: see what tokens it depends on
lsprag token-defs --file "$(realpath src/server.ts)" --symbol handleRequest

# Step 3: read the body of a key dependency
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody
```

**Why**: start with structure before loading file content — it shows you what matters.

### Before Modifying a Function

```bash
# Check the call tree for impact scope
lsprag def-tree --file "$(realpath src/server.ts)" --symbol targetFunction --depth 4

# See all dependencies it references
lsprag token-defs --file "$(realpath src/server.ts)" --symbol targetFunction

# Find callers (grep is still fine for this)
grep -rn "targetFunction" . --include="*.ts" -A1 -B1
```

### Reading a Definition from a Call Site

```bash
# You see a call to parseBody() on line 42, col 15 — get its full source:
lsprag retrieve-def --file "$(realpath src/server.ts)" --symbol parseBody --location 42:15
```

### Exploring an Unfamiliar Codebase

```bash
# Map the entry point
lsprag def-tree --file "$(realpath src/main.ts)" --symbol main --depth 5

# See what it directly depends on
lsprag token-defs --file "$(realpath src/main.ts)" --symbol main
```

### Go Codebases

```bash
lsprag def-tree     --file "$(realpath main.go)" --symbol HandleRequest --depth 3
lsprag retrieve-def --file "$(realpath main.go)" --symbol HandleRequest
lsprag token-defs   --file "$(realpath main.go)" --symbol HandleRequest
```

## Notes

- Regex mode analyzes only the given file. For cross-file call resolution, configure `LSPRAG_LSP_PROVIDER`.
- Arrow functions and class methods are detected in TypeScript/JavaScript.
- `def-tree` detects cycles and marks them to prevent infinite recursion.
