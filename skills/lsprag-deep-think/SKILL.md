---
name: lsprag-deep-think
description: High-effort code understanding via BFS dependency expansion. Use when you need to deeply understand a complex function before writing tests, refactoring, or debugging — it recursively retrieves the source and dependencies of every symbol a function touches.
license: LICENSE
---

# LSPRAG Deep Think — BFS Code Understanding

## IMPORTANT: PREREQUISITE

Before using this skill, verify the installation:

```bash
bash "$LSPRAG_SKILLS_ROOT/scripts/update.sh"
```

Confirm the CLI is available:

```bash
lsprag --help
```

**IF THE CLI IS NOT WORKING, DO NOT PROCEED. Ask the user to run the installer first.**

## Overview

`lsprag deep-think` performs **BFS expansion** of a symbol's entire dependency graph:

1. Retrieves the full source of the starting symbol
2. Lists every token dependency (what that symbol calls/uses)
3. For each dependency, retrieves its source and its own dependencies
4. Continues until the configured depth is reached or all symbols are visited

Use this when `def-tree` shows a complex call chain and you need to understand each piece before acting.

## When to Use

| Situation | Use deep-think? |
|-----------|----------------|
| Writing a test for a function you haven't seen before | Yes — depth 1 or 2 |
| Refactoring a function with many dependencies | Yes — depth 2 |
| Pre-audit before a large change | Yes — depth 2–3 |
| Quick lookup of what a function calls | No — use `def-tree` |
| Just need one function's source | No — use `retrieve-def` |

**Start at depth 1.** If the output still has symbols you don't understand, run again with `--depth 2` for those specific symbols.

## Command

```bash
lsprag deep-think --file <absolute_path> --symbol <name> [--depth <n>]
```

| Arg | Description | Default |
|-----|-------------|---------|
| `--file` | Absolute path to source file | required |
| `--symbol` | Starting symbol name | required |
| `--depth` | Max BFS depth (0 = root only, 1 = root + direct deps, 2 = +their deps) | `2` |

**Always use absolute paths:**

```bash
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 2
```

## Example Output

```
# Deep Think: 'handleRequest' (max depth: 2)
# File: src/server.ts

## Level 0: handleRequest (src/server.ts:15:10)

\`\`\`
function handleRequest(req, res) {
  const body = parseBody(req);
  sendResponse(res, formatJSON(body));
}
\`\`\`

**Dependencies:**

  L  16:C  7  parseBody    ->  src/server.ts:42:10
  L  17:C  3  sendResponse ->  src/server.ts:58:10
  L  17:C 16  formatJSON   ->  src/server.ts:73:10

---

## Level 1: parseBody (src/server.ts:42:10)

\`\`\`
function parseBody(req) {
  return JSON.parse(req.body);
}
\`\`\`

_No resolved dependencies (regex mode: only same-file functions are tracked)_

## Level 1: sendResponse (src/server.ts:58:10)
...
```

## Recommended Workflow

### Before Writing a Test

```bash
# Step 1: see the full call tree
lsprag def-tree --file "$(realpath src/server.ts)" --symbol handleRequest

# Step 2: deep-expand all direct dependencies
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 1

# Step 3: if a dependency is still unclear, expand it specifically
lsprag deep-think --file "$(realpath src/server.ts)" --symbol parseBody --depth 1
```

### Before Refactoring

```bash
# Understand the full scope of what you're about to change
lsprag deep-think --file "$(realpath src/server.ts)" --symbol targetFunction --depth 2

# Cross-check callers with grep
grep -rn "targetFunction" . --include="*.ts" -B1 -A1
```

## Notes

- In regex mode, cross-file dependencies are **not** resolved. Only same-file function definitions are tracked.
- Set `LSPRAG_LSP_PROVIDER` to enable cross-file dependency resolution.
- BFS visits each `(file, symbol)` pair at most once — cycles are automatically prevented.
- Output grows quickly with depth. Prefer `--depth 1` for initial exploration.
