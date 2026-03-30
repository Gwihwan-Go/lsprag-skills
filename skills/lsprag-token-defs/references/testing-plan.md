# Testing Plan

## Goal

Verify `getDecodedTokensFromSymbolWithDefs` decodes semantic tokens within a symbol range and resolves definitions via the provided LSP adapter.

## Core Smoke Test (Node)

1. Build a small `LspDocument` fixture with two functions (`foo`, `bar`).
2. Implement a `TokenProvider` with:
   - `getSemanticTokens` + `getSemanticTokensLegend` returning tokens for `foo` and `bar`.
   - `getDefinitions` returning the definition range for `bar`.
3. Call `getDecodedTokensFromSymbolWithDefs(document, fooSymbol, provider)`.
4. Assert:
   - The decoded tokens exclude the symbol name `foo`.
   - The remaining token resolves to `bar` with a definition range pointing at the correct line.

## Opencode Wiring Test (Optional)

1. Wrap `getDecodedTokensFromSymbolWithDefs` as a custom tool or MCP server.
2. Start OpenCode with the tool enabled and a repo with LSP support.
3. Invoke the tool on a known symbol.
4. Validate:
   - LSP server initializes successfully.
   - Returned tokens include definitions for identifiers inside the target symbol.
