---
name: lsprag-deep-think
description: High-effort code understanding via BFS dependency expansion. Use when you need to deeply understand a complex function before writing tests, refactoring, or debugging — it recursively retrieves the source and dependencies of every symbol a function touches.
license: LICENSE
---

# LSPRAG Deep Think — BFS Code Understanding

If `lsprag` is not found, ask the user to run `bash install.sh` from the lsprag-skills root directory.

## Overview

`lsprag deep-think` performs **BFS expansion** of a symbol's entire dependency graph:

1. Retrieves the full source of the starting symbol
2. Lists every token dependency (what that symbol calls/uses)
3. For each dependency, retrieves its source and its own dependencies
4. Continues until the configured depth is reached or all symbols are visited
5. Outputs a **Summary** and **Agent Instructions** with concrete follow-up commands

## When to Use

| Situation | Use deep-think? |
|-----------|----------------|
| Writing a test for a function you haven't seen before | Yes — depth 1 or 2 |
| Refactoring a function with many dependencies | Yes — depth 2 |
| Pre-audit before a large change | Yes — depth 2-3 |
| Just need one function's source | No — use `getDefinition` |
| Need token-level dependency map | No — use `getTokens` |

**Start at depth 1.** Follow the Agent Instructions in the output to dig into specific branches.

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

function handleRequest(req, res) {
  const body = parseBody(req);
  sendResponse(res, formatJSON(body));
}

**Dependencies:**

  L  16:C  7  parseBody    ->  src/server.ts:42:10
  L  17:C  3  sendResponse ->  src/server.ts:58:10
  L  17:C 16  formatJSON   ->  src/server.ts:73:10

---

## Level 1: parseBody (src/server.ts:42:10)
...

---

## Summary

| Metric | Value |
|--------|-------|
| Root symbol | `handleRequest` (src/server.ts) |
| Symbols visited | 5 |
| Max depth reached | 2 |
| Leaf nodes | formatJSON |
| Truncated (depth limit) | sendResponse |

## Agent Instructions

Continue exploring with these commands:

### Look up leaf node definitions
`lsprag getDefinition --file "$(realpath src/server.ts)" --symbol formatJSON`

### Explore truncated branches (hit depth limit)
`lsprag getTokens --file "$(realpath src/server.ts)" --symbol sendResponse`

### Find callers of the root symbol
`lsprag getReference --file "$(realpath src/server.ts)" --symbol handleRequest`

### Search for related patterns
`rg -n "handleRequest" . --type ts`
```

## Recommended Workflow

```bash
# Step 1: expand the function's dependency graph
lsprag deep-think --file "$(realpath src/server.ts)" --symbol handleRequest --depth 1

# Step 2: follow the Agent Instructions to dig into specific branches
# (the output tells you exactly which commands to run next)

# Step 3: find who calls this function
lsprag getReference --file "$(realpath src/server.ts)" --symbol handleRequest
```

## Notes

- In regex mode, cross-file dependencies are **not** resolved. Only same-file function definitions are tracked.
- Set `LSPRAG_LSP_PROVIDER` to enable cross-file dependency resolution.
- BFS visits each `(file, symbol)` pair at most once — cycles are automatically prevented.
- Output grows quickly with depth. Prefer `--depth 1` for initial exploration.
- The **Agent Instructions** section suggests `getTokens` for branches that hit the depth limit and `getDefinition` for leaf nodes.
