---
name: lsprag-retrieve-defs
description: Use when exporting LSPRAG definition retrieval (retrieveDefs) as a standalone module or wiring it to custom LSP/MCP clients.
---

# LSPRAG Definition Retrieval (Portable)

This skill packages the portable `retrieveDefs` implementation so it can run outside VS Code.

## Install + Use

- See `skills/lsprag-retrieve-defs/references/deployment.md` for step-by-step install and usage.

## Core Module

- Portable API: `src/definitionCore.ts`
- Exported function: `retrieveDefs(document, decodedTokens, provider, skipDefinition?)`
- You must provide a `DefinitionProvider` that connects to your LSP client or MCP server.

## Quick Wiring Guide

1. Implement `DefinitionProvider` for your environment. Required: `getDefinitions`. Optional: `isInWorkspace`, `log`.
2. Call `retrieveDefs` with your document and decoded tokens.

## Deployment + Tests

- Deployment guide: `skills/lsprag-retrieve-defs/references/deployment.md`
- Testing plan: `skills/lsprag-retrieve-defs/references/testing-plan.md`
