---
name: lsprag-retrieve-defs
version: "0.1.0"
description: "Batch-resolve where each decoded semantic token in a symbol is defined. Returns tokens annotated with definition locations. Core primitive used by lsprag-def-tree. Requires LSP backend."
argument-hint: 'lsprag-retrieve-defs — call retrieveDefs(document, tokens, provider)'
allowed-tools: Bash, Read
homepage: https://github.com/Gwihwan-Go/lsprag-skills
repository: https://github.com/Gwihwan-Go/lsprag-skills
author: Gwihwan-Go
license: MIT
user-invocable: true
metadata:
  lsprag:
    requires:
      env:
        - LSPRAG_SKILLS_ROOT
      bins:
        - node
    tags:
      - lsp
      - code-analysis
      - definitions
      - typescript
      - go
---

# LSPRAG Retrieve Definitions

Given a list of decoded semantic tokens, batch-resolve where each is defined using an LSP-backed provider. This is the core primitive that powers `lsprag-def-tree` and `lsprag-token-defs`.

## When to Use

- You have a list of tokens from a function and need to know where each is defined
- You want to build a custom dependency analysis on top of definition data
- You are composing this with `lsprag-token-defs` for a full token + definition pipeline

## Note for Agents

This skill is a **library primitive** — it does not have a standalone CLI wrapper. To use it:

1. For a ready-to-use call tree, use `lsprag-def-tree` instead:
   ```bash
   LSPRAG_SKILLS_ROOT="${LSPRAG_SKILLS_ROOT:-$HOME/.lsprag-skills}" \
   npx tsx "$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts" \
     --file /absolute/path/to/source.ts \
     --symbol myFunction
   ```

2. For programmatic use, import and call directly (requires LSP backend):

```ts
import { retrieveDefs, DefinitionProvider } from "$LSPRAG_SKILLS_ROOT/src/definitionCore.js";

const provider: DefinitionProvider = {
  getDefinitions: async (doc, pos) => lspClient.definition(doc.uri, pos),
};

const tokensWithDefs = await retrieveDefs(document, decodedTokens, provider);
```

## Inputs

| Param | Type | Description |
|-------|------|-------------|
| `document` | `LspDocument` | Source document |
| `decodedTokens` | `CoreDecodedToken[]` | Tokens from semantic token decoding |
| `provider` | `DefinitionProvider` | LSP definition backend |
| `skipDefinition` | `boolean` | Skip def lookup (default: false) |

## Output

`CoreDecodedToken[]` — same tokens with `.definition`, `.document`, `.defSymbol`, `.defSymbolRange` populated.

## Notes

- Requires an LSP server for definition lookup
- See `skills/lsprag-retrieve-defs/references/deployment.md` for full wiring guide
