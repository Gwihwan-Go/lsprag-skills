---
name: lsprag-token-defs
description: Use when exporting LSPRAG token decoding plus definition matching (getDecodedTokensFromSymbol -> retrieveDefs) as a standalone module or wiring it to custom LSP/MCP clients.
---

# LSPRAG Token Definitions (Portable)

This skill packages a portable pipeline that decodes tokens within a symbol and resolves their definitions.

## Install + Use

- See `skills/lsprag-token-defs/references/deployment.md` for step-by-step install and usage.

## Core Module

- Portable API: `src/tokenDefsCore.ts` (built on `tokenCore` + `definitionCore`)
- Exported function: `getDecodedTokensFromSymbolWithDefs(document, symbol, provider, skipDefinition?)`
- You must provide a `TokenProvider` that connects to your LSP client or MCP server.

## Quick Wiring Guide

1. Implement `TokenProvider` for your environment:
   - `openDocument`
   - `getDocumentSymbols`
   - `getDefinitions`
   - `getSemanticTokens`
   - `getSemanticTokensLegend`
2. Call `getDecodedTokensFromSymbolWithDefs` with your document + symbol.

## Deployment + Tests

- Deployment guide: `skills/lsprag-token-defs/references/deployment.md`
- Testing plan: `skills/lsprag-token-defs/references/testing-plan.md`
