# lsprag-skills

Minimal, portable skill implementations extracted from LSPRAG.

## Included

- `skills/lsprag-reference-info`: portable `getReferenceInfo` skill
- `src/referenceCore.ts`: standalone implementation used by the skill
- `skills/lsprag-retrieve-defs`: portable `retrieveDefs` skill
- `src/definitionCore.ts`: standalone definition retrieval helpers
- `skills/lsprag-def-tree`: portable `buildDefTree` skill
- `src/treeCore.ts`: standalone definition tree implementation (plus core helpers)

## Install (local clone)

See `skills/lsprag-reference-info/references/deployment.md` for one‑command install options.

## Tests

```bash
npm install
npm run test
```

Skill-only dependency check:

```bash
npm run test:deps
```

Optional OpenCode integration test:

```bash
npm run test:opencode
```
