# Deployment Guide (Agent Community)

This module exposes a portable `getReferenceInfo` in `src/referenceCore.ts`. It runs anywhere as long as you provide a `ReferenceProvider` that talks to your LSP client or MCP server.

## Prerequisites

For repo-level install paths, agent setup, and LSP server notes, see the root `README.md`.

## Use from Code (Minimal Node Integration)

1. Import the portable function:

```ts
import { getReferenceInfo, ReferenceProvider } from "./src/referenceCore";
```

2. Provide a `ReferenceProvider` backed by your LSP client:

```ts
const provider: ReferenceProvider = {
  getReferences: async (doc, pos) => lspClient.references(doc.uri, pos),
  openDocument: async (uri) => ({ uri, getText: () => fs.readFileSync(uri, "utf8") }),
  getSymbols: async (uri) => lspClient.documentSymbols(uri),
};
```

3. Call the function:

```ts
const info = await getReferenceInfo(document, range, provider, { refWindow: 60 });
```

## Use from MCP (Optional)

Wrap `getReferenceInfo` in a small MCP server and register it in your agent config:

```json
{
  "mcpServers": {
    "lsprag-reference-info": {
      "command": "/path/to/lsprag-reference-info",
      "args": []
    }
  }
}
```

Restart your agent, then confirm the tools show up.

## References

- https://github.com/lsp-client/lsp-skill
- https://github.com/DeusData/codebase-memory-mcp
