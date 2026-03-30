---
name: lsprag-def-tree
description: Use when exporting LSPRAG buildDefTree as a standalone module or wiring it to custom LSP/MCP clients.
---

# LSPRAG Definition Tree (Portable)

This skill packages the portable `buildDefTree` implementation so it can run outside VS Code.

## Install + Use

- See `skills/lsprag-def-tree/references/deployment.md` for step-by-step install and usage.

## Core Module

- Portable API: `src/treeCore.ts` (plus token/definition/symbol helpers)
- Exported function: `buildDefTree(document, symbol, provider, maxDepth)`
- You must provide a `TokenProvider` that connects to your LSP client or MCP server.

## Quick Wiring Guide

1. Implement `TokenProvider` for your environment:
   - `openDocument`
   - `getDocumentSymbols`
   - `getDefinitions`
   - `getSemanticTokensRange` + `getSemanticTokensLegendRange`
2. Call `buildDefTree` with your document and target symbol.

## Deployment + Tests

- Deployment guide: `skills/lsprag-def-tree/references/deployment.md`
- Testing plan: `skills/lsprag-def-tree/references/testing-plan.md`
