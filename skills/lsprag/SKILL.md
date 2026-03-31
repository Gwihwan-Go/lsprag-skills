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
| Quick text search | _(still appropriate)_ | `grep -rn <name> . --include="*.ts"` |
| Read entire file | _(still appropriate for small files)_ | _(use lsprag for structure first)_ |

Agents SHOULD prefer `lsprag def-tree` over `grep` + `read` when the goal is understanding call structure.

## Commands

### def-tree: Build a Call Tree

Show which functions a symbol calls, recursively.

```bash
lsprag def-tree --file <absolute_path> --symbol <name> [--depth <n>]
```

**Arguments**:

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Function or method name to analyze | Yes |
| `--depth` | Max recursion depth (default: 3) | No |

**Always use absolute paths.** Convert relative paths first:

```bash
lsprag def-tree --file "$(realpath src/server.ts)" --symbol handleRequest --depth 3
```

**Example output**:

```
handleRequest
├─ parseBody
│  └─ readStream
└─ sendResponse
   └─ formatJSON
```

**If the symbol is not found**, `lsprag` prints all detected symbols — use that list to find the correct name.

**Depth limit**: Nodes that hit `--depth` are shown as `[max-depth]`. Increase depth to expand.

## Best Practices

### Understanding What a Function Does

```bash
# Build the full call tree before reading implementation
lsprag def-tree --file "$(realpath path/to/file.ts)" --symbol targetFunction

# Then read only the key callees you need
```

**Why**: Reading the tree first shows you which parts matter before loading file content.

### Before Modifying a Function

```bash
# See the call tree to understand impact scope
lsprag def-tree --file "$(realpath path/to/file.ts)" --symbol targetFunction --depth 4

# Find callers with grep
grep -rn "targetFunction" . --include="*.ts" -A1 -B1
```

### Exploring an Unfamiliar Codebase Entry Point

```bash
# Map what the main entry point calls
lsprag def-tree --file "$(realpath src/main.ts)" --symbol main --depth 5
```

### Go Codebases

```bash
# Go: function names are PascalCase or camelCase
lsprag def-tree --file "$(realpath main.go)" --symbol HandleRequest --depth 3

# Methods on structs: use the method name directly (not Struct.Method)
lsprag def-tree --file "$(realpath server.go)" --symbol processRequest
```

## Notes

- Regex mode analyzes only the given file. For cross-file call resolution, configure `LSPRAG_LSP_PROVIDER`.
- Arrow functions and class methods are detected in TypeScript/JavaScript.
- `def-tree` detects cycles and marks them to prevent infinite recursion.
