# Testing Plan

## Goal

Verify `buildDefTree` works end-to-end with an LSP-backed provider and that the produced tree is stable and reasonable.

## Core Smoke Test (Node)

1. Spin up an LSP client (tsserver or pylsp) and implement `TokenProvider`.
2. Load a fixture file with 2-3 functions and known dependencies.
3. Call `buildDefTree(document, symbol, provider, 3)`.
4. Assert:
   - Root node name matches the target symbol.
   - At least one child node is returned.
   - No duplicate cycles (tree size is bounded).

## Opencode Wiring Test

1. Wrap `buildDefTree` as a custom tool or MCP server (same as reference skill).
2. Start OpenCode with the tool enabled and a repo with LSP support.
3. Invoke the tool with a known symbol.
4. Validate:
   - LSP server initializes successfully.
   - The tool returns a non-empty tree.
   - The tree is consistent with expected call relationships.

## Regression Guard

- Re-run the opencode test after any changes to token/definition/core modules.
