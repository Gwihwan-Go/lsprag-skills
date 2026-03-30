---
name: lsprag-def-tree
description: Build a definition tree showing which functions/methods a symbol calls, using the lsprag-skills library. Requires LSPRAG_SKILLS_ROOT to be set.
---

# LSPRAG Definition Tree

Build a lightweight definition tree rooted at a target symbol. Shows which functions and methods are called (and what they call in turn), up to a configurable depth.

## When to Use

- User asks "what does function X call?" or "show me the call chain for Y"
- User wants to understand code dependencies for a function or method
- You need to build context about a symbol before editing it

## How to Invoke

Run the CLI script with the Bash tool:

```bash
npx tsx "$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts" \
  --file /path/to/source.ts \
  --symbol functionName \
  --depth 3
```

**Requirements:**
- `LSPRAG_SKILLS_ROOT` must be set (e.g. `export LSPRAG_SKILLS_ROOT=~/.lsprag-skills`)
- Node.js 18+ with `npx tsx` available

**Supported languages:** TypeScript, JavaScript, Go (`.ts`, `.js`, `.go`)

## Example

```bash
npx tsx "$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts" \
  --file ./src/server.ts \
  --symbol handleRequest \
  --depth 3
```

Output example:
```
handleRequest
├─ parseBody
│  └─ readStream
└─ sendResponse
   └─ formatJSON
```

## Inputs

| Arg | Description |
|-----|-------------|
| `--file` | Path to the source file (absolute or relative to cwd) |
| `--symbol` | Name of the function/method to analyze |
| `--depth` | Max depth (default: 3) |

## Output

ASCII tree of the call hierarchy. Each node is a function name; children are functions it calls.

## Notes

- Uses regex-based symbol parsing + semantic token analysis — no LSP server required for this CLI mode
- For LSP-backed analysis (cross-file definitions), use the `TokenProvider` API directly in code
- See `README.md` for full setup and deployment guide
