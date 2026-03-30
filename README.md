# lsprag-skills

Minimal, portable skill implementations extracted from LSPRAG.

## Included

- `skills/lsprag-reference-info`: portable `getReferenceInfo` skill
- `src/referenceCore.ts`: standalone implementation used by the skill
- `skills/lsprag-def-tree`: portable `buildDefTree` skill
- `src/treeCore.ts`: standalone definition tree implementation (plus core helpers)

## Install (local clone)

See `skills/lsprag-reference-info/references/deployment.md` for one‑command install options.

## Tests

```bash
npm install
npm run test:core
```

Skill-only dependency check:

```bash
npm run test:deps
```

Optional OpenCode integration test:

```bash
npm run test:opencode
```

Docker integration test (installs OpenCode + Claude Code in a clean container):

```bash
npm run test:docker
```

Notes:

- Requires a running Docker daemon.
- The container installs OpenCode and Claude Code using their official install scripts:
  - `curl -fsSL https://opencode.ai/install | bash`
  - `curl -fsSL https://claude.ai/install.sh | bash`
