---
name: lsprag-token-defs
version: "0.1.0"
description: "Extract semantic tokens from a symbol and resolve their definitions in one call. High-level pipeline combining token extraction + definition lookup. Requires LSP backend."
argument-hint: 'lsprag-token-defs — call getDecodedTokensFromSymbolWithDefs(document, symbol, provider)'
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
      - semantic-tokens
      - definitions
      - typescript
      - go
---

# LSPRAG Token Definitions

High-level pipeline: given a document and symbol, extract all semantic tokens from the symbol body, then batch-resolve where each is defined. Combines token extraction + definition lookup in one call.

## When to Use

- You need a complete picture of what tokens a function uses and where they're defined
- You want to build a definition tree or dependency graph
- You are constructing analysis context for code generation

## Note for Agents

This skill is a **library primitive** — it requires a `TokenProvider` backed by a live LSP server and does not have a standalone CLI.

**For a ready-to-use call tree (no LSP needed), use `lsprag-def-tree`:**

```bash
LSPRAG_SKILLS_ROOT="${LSPRAG_SKILLS_ROOT:-$HOME/.lsprag-skills}" \
npx tsx "$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts" \
  --file /absolute/path/to/source.ts \
  --symbol myFunction
```

## Programmatic API

```ts
import { getDecodedTokensFromSymbolWithDefs } from "$LSPRAG_SKILLS_ROOT/src/tokenDefsCore.js";
import { TokenProvider } from "$LSPRAG_SKILLS_ROOT/src/tokenCore.js";

const provider: TokenProvider = {
  openDocument: async (uri) => ...,
  getDocumentSymbols: async (uri) => ...,
  getDefinitions: async (doc, pos) => ...,
  getSemanticTokens: async (doc) => ...,
  getSemanticTokensLegend: async (doc) => ...,
};

const tokens = await getDecodedTokensFromSymbolWithDefs(document, symbol, provider);
// tokens[n].word       — token name
// tokens[n].definition — definition location (URI + range)
// tokens[n].defSymbol  — the symbol containing the definition
```

## Inputs

| Param | Type | Description |
|-------|------|-------------|
| `document` | `LspDocument` | Source document |
| `symbol` | `LspSymbol` | Target symbol to analyze |
| `provider` | `TokenProvider` | Full LSP provider (tokens + definitions) |
| `skipDefinition` | `boolean` | Skip def lookup (default: false) |

## Output

`CoreDecodedToken[]` — tokens from the symbol body with definitions resolved.

## Notes

- Requires a `TokenProvider` with LSP backend for semantic tokens and definitions
- For Go: use `gopls`; for TypeScript: use `tsserver`
- See `skills/lsprag-token-defs/references/deployment.md` for full wiring guide
