---
name: lsprag-def-tree
description: Build a definition tree for a target symbol using an LSP-backed provider.
---

# LSPRAG Definition Tree (Portable)

Build a lightweight definition tree for a symbol.

## Use When

- You need a definition tree rooted at a target symbol.
- You can provide LSP/MCP-backed token + definition data.

## Invocation

- Function: `buildDefTree(document, symbol, provider, maxDepth)`
- Returns: definition tree

## Inputs Required

- `document` (uri, languageId, getText)
- `symbol` (target LSP symbol)
- `provider` (`TokenProvider`)
- `maxDepth` (optional number)

## Provider Methods

- `openDocument`
- `getDocumentSymbols`
- `getDefinitions`
- `getSemanticTokensRange`
- `getSemanticTokensLegendRange`

## Output

- Definition tree rooted at `symbol`

## References

- Repo setup: `README.md`
- Deployment: `skills/lsprag-def-tree/references/deployment.md`
