---
name: lsprag-reference-info
version: "0.1.0"
description: "Find all callers of a symbol and extract their surrounding code context. Returns concatenated reference snippets from across the codebase. Requires an LSP backend (gopls, tsserver, pylsp)."
argument-hint: 'lsprag-reference-info — find all usages of a symbol using LSP'
allowed-tools: Bash, Read
homepage: https://github.com/Gwihwan-Go/lsprag-skills
repository: https://github.com/Gwihwan-Go/lsprag-skills
author: Gwihwan-Go
license: MIT
user-invocable: true
metadata:
  lsprag:
    requires:
      env:
        - LSPRAG_SKILLS_ROOT
      bins:
        - node
    tags:
      - lsp
      - code-analysis
      - references
      - typescript
      - go
---

# LSPRAG Reference Info

Find all callers of a symbol and return their code context. Useful for understanding how a function is used before modifying its signature or behavior.

## When to Use

- User asks "who calls function X?" or "show me usages of Y"
- You need to understand impact before changing a function signature
- You want to find all test cases that exercise a particular function

## Agent Quickstart: Use grep (no LSP needed)

For finding references without an LSP backend, use grep directly:

```bash
# Find all usages of a function named "handleRequest" in TypeScript files
grep -rn "handleRequest" /path/to/project --include="*.ts" -A 3 -B 1

# For Go files
grep -rn "HandleRequest" /path/to/project --include="*.go" -A 3 -B 1
```

This is the recommended approach for agents that don't have a live LSP connection.

## LSP-Backed Usage (Full Cross-File Support)

This skill exposes the `getReferenceInfo` function from `src/referenceCore.ts`. It requires an LSP backend.

**API:**

```ts
import { getReferenceInfo, ReferenceProvider } from "$LSPRAG_SKILLS_ROOT/src/referenceCore.js";

const provider: ReferenceProvider = {
  getReferences: async (doc, pos) => lspClient.references(doc.uri, pos),
  openDocument: async (uri) => ({ uri, languageId: "typescript", getText: () => fs.readFileSync(uri, "utf8") }),
  getSymbols: async (uri) => lspClient.documentSymbols(uri),
};

const context = await getReferenceInfo(document, range, provider, { refWindow: 50 });
```

**LSPRAG_SKILLS_ROOT must be set:**
```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

## Output

Concatenated code snippets from each reference site, separated by file/line markers.

## Notes

- LSP reference lookup requires a running language server (`gopls` for Go, `tsserver` for TypeScript)
- For quick text-based reference finding, use grep (shown above) — faster and no setup needed
- See `skills/lsprag-reference-info/references/deployment.md` for full LSP wiring guide
