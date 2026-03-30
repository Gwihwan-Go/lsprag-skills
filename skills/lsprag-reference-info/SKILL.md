---
name: lsprag-reference-info
description: Analyze references for a target range using an LSP-backed provider.
---

# LSPRAG Reference Info (Portable)

Analyze references for a target range.

## Use When

- You need references for a target range/symbol.
- You can provide LSP/MCP-backed reference + symbol data.

## Invocation

- Function: `getReferenceInfo(document, range, provider, options)`
- Returns: reference summary

## Inputs Required

- `document` (uri, languageId, getText)
- `range` (LSP range)
- `provider` (`ReferenceProvider`)
- `options` (optional)

## Provider Methods

- `getReferences`
- `openDocument`
- `getSymbols`

## Output

- Reference analysis for the target range

## References

- Repo setup: `README.md`
- Deployment: `skills/lsprag-reference-info/references/deployment.md`
