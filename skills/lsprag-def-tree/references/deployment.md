# Deployment Guide (Agent Community)

This module exposes a portable `buildDefTree` in `src/treeCore.ts`. It runs anywhere as long as you provide a `TokenProvider` that talks to your LSP client or MCP server.

## Prerequisites

For repo-level install paths, agent setup, and LSP server notes, see the root `README.md`.

## Use from Code (Minimal Node Integration)

1. Import the portable function:

```ts
import { buildDefTree, TokenProvider } from "./src/treeCore";
```

2. Provide a `TokenProvider` backed by your LSP client:

```ts
const provider: TokenProvider = {
  openDocument: async (uri) => ({ uri, getText: () => fs.readFileSync(uri, "utf8") }),
  getDocumentSymbols: async (uri) => lspClient.documentSymbols(uri),
  getDefinitions: async (doc, pos) => lspClient.definitions(doc.uri, pos),
  getSemanticTokensRange: async (doc, range) => lspClient.semanticTokensRange(doc.uri, range),
  getSemanticTokensLegendRange: async (doc, range) => lspClient.semanticTokensLegendRange(doc.uri, range)
};
```

3. Call the function:

```ts
const tree = await buildDefTree(document, symbol, provider, 3);
```

## Use from MCP (Optional)

Wrap `buildDefTree` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-def-tree": {
      "command": "/path/to/lsprag-def-tree",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.

## Notes

- This workflow relies on semantic tokens + definitions from your LSP server.
- If your LSP does not support `textDocument/semanticTokens`, you must implement a fallback tokenizer.
