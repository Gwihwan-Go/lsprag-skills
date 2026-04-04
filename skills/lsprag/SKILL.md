---
name: lsprag
description: Semantic code analysis for AI agents — build definition trees, find callers, and map call chains across TypeScript, JavaScript, Go, and Python. Use when asked to understand what a function calls, trace dependencies, or analyze code structure before editing. Requires language servers (typescript-language-server, gopls, pylsp).
license: LICENSE
---

# LSPRAG — Code Analysis

If `lsprag` is not found, ask the user to run `bash install.sh` from the lsprag-skills root directory.

## Overview

`lsprag` is a code analysis CLI. It analyzes source files to map function call trees, definitions, tokens, and references.

- **LSP-powered**: All commands use real language servers for accurate cross-file analysis. `LSPRAG_LSP_PROVIDER` must be set.
- **Supported languages**: TypeScript, JavaScript (`.ts`, `.js`), Go (`.go`), Python (`.py`)

## Tool Selection

| Task | Traditional approach | lsprag |
|------|----------------------|--------|
| What does function X call? | `grep` + manual tracing | `lsprag callHierarchy --file <f> --symbol <name> --direction outgoing` |
| Read a function's full source | `Read` or `grep` for body | `lsprag getDefinition --file <f> --symbol <name>` |
| Inspect a constant or variable | Read file manually | `lsprag getDefinition --file <f> --symbol <name>` (uses hover) |
| Jump to definition from a call site | (open file manually) | `lsprag getDefinition --file <f> --symbol <name> --location <line>:<col>` |
| What does a function depend on? | Read and trace manually | `lsprag getTokens --file <f> --symbol <name>` |
| Who calls this function? | `grep -rn <name>` | `lsprag getReference --file <f> --symbol <name>` |
| Quick text search | _(still appropriate)_ | `grep -rn <name> . --include="*.ts"` |

Prefer `lsprag` commands over `grep + Read` when the goal is understanding code structure or dependencies.

## Commands

### getDefinition: Get a Symbol's Full Source or Type Info

Return the complete source of a function/class definition, or hover type info for variables and constants.

**Symbol routing:**
- **function / method / class** -> go-to-definition (prints full body)
- **variable / const / property / parameter** -> hover (prints type declaration)

**By name** — detects symbol kind and routes automatically:

```bash
lsprag getDefinition --file <absolute_path> --symbol <name>
```

**By location** — inspects token type at `<line>:<col>` and routes accordingly:

```bash
lsprag getDefinition --file <absolute_path> --symbol <name> --location <line>:<col>
```

`--location` accepts 1-indexed line and column (matching editor line numbers).

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Symbol name to look up | Yes |
| `--location` | `<line>:<col>` of a usage site (1-indexed) | No |

---

### getTokens: Decompose a Symbol into Tokens + Definitions

List every identifier token within a symbol body and show where each is defined.

```bash
lsprag getTokens --file <absolute_path> --symbol <name>
```

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Function or method name to analyze | Yes |

---

### getReference: Find All Callers / Usages

Find every place in the codebase that references a symbol.

**Requires `LSPRAG_LSP_PROVIDER`** — exits with an error if not set.

```bash
lsprag getReference --file <absolute_path> --symbol <name> [--location <line>:<col>] [--window <lines>]
```

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file containing the symbol | Yes |
| `--symbol` | Symbol name to find references for | Yes |
| `--location` | `<line>:<col>` of symbol in file (1-indexed) | No |
| `--window` | Max lines of reference context to return (default: 60) | No |

---

## Best Practices

### Understanding What a Function Does

```bash
lsprag callHierarchy --file "$(realpath src/server.ts)" --symbol handleRequest --direction outgoing
lsprag getTokens     --file "$(realpath src/server.ts)" --symbol handleRequest
lsprag getDefinition --file "$(realpath src/server.ts)" --symbol parseBody
```

### Before Modifying a Function

```bash
lsprag callHierarchy --file "$(realpath src/server.ts)" --symbol targetFunction --direction outgoing
lsprag getTokens     --file "$(realpath src/server.ts)" --symbol targetFunction
lsprag getReference  --file "$(realpath src/server.ts)" --symbol targetFunction
```

### Go Codebases

```bash
lsprag callHierarchy --file "$(realpath main.go)" --symbol HandleRequest --direction outgoing
lsprag getDefinition --file "$(realpath main.go)" --symbol HandleRequest
lsprag getTokens     --file "$(realpath main.go)" --symbol HandleRequest
lsprag getReference  --file "$(realpath main.go)" --symbol HandleRequest
```

## Notes

- All commands require `LSPRAG_LSP_PROVIDER` to be set. Run `bash install.sh` to configure it automatically.
- Arrow functions and class methods are detected in TypeScript/JavaScript.
- `deep-think` detects cycles and marks them to prevent infinite recursion.
- `getDefinition` returns full type information for variables and constants via LSP hover.
