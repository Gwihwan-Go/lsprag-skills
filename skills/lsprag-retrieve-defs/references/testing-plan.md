# Testing Plan

## Goal

Verify `retrieveDefs` resolves definitions with an LSP-backed provider and behaves correctly when definitions are skipped.

## Core Smoke Test (Node)

1. Implement a `DefinitionProvider` with a tiny in-memory definition map.
2. Build a `LspDocument` with a small fixture and a token that points at a symbol use site.
3. Call `retrieveDefs(document, tokens, provider)`.
4. Assert:
   - The token word is filled in from the document.
   - `definition` contains the expected URI and range.
5. Call `retrieveDefs(document, tokens, provider, true)` and assert `definition` is empty.

## Opencode Wiring Test (Optional)

1. Wrap `retrieveDefs` as a custom tool or MCP server.
2. Start OpenCode with the tool enabled and a repo with LSP support.
3. Invoke the tool on a known symbol usage.
4. Validate:
   - LSP server initializes successfully.
   - The returned definition location matches the expected file and line.
