# lsprag-skills

Portable LSPRAG skills and core modules that can run outside VS Code.

## Repository Layout

- `src/`: portable TypeScript core modules
- `skills/`: lightweight skill descriptors and skill-scoped references
- `tests/`: core and integration smoke tests

## Skills Directory Policy

To keep this repository clean:

- Put repository-level setup, environment, model, and multi-agent install instructions in this README.
- Keep each `skills/*/SKILL.md` focused on skill intent and usage contract.
- Keep `skills/*/references/*` focused on skill-specific API/deployment details.

This avoids repeating broad setup docs in every skill folder.

## Included

- `skills/lsprag-reference-info`: portable `getReferenceInfo` skill
- `src/referenceCore.ts`: standalone implementation used by the skill
- `skills/lsprag-retrieve-defs`: portable `retrieveDefs` skill
- `src/definitionCore.ts`: standalone definition retrieval helpers
- `skills/lsprag-def-tree`: portable `buildDefTree` skill
- `src/treeCore.ts`: standalone definition tree implementation (plus core helpers)

## Install

```bash
npm install
```

## Install Skills (Agent Runtime)

Common community skill paths:

- Claude Code: `~/.claude/skills/`
- Gemini: `~/.gemini/skills/`
- Codex: `~/.codex/skills/`
- OpenCode: `~/.config/opencode/skill/`

Example (Codex):

```bash
mkdir -p ~/.codex/skills
ln -sfn /absolute/path/to/lsprag-skills/skills/lsprag-def-tree ~/.codex/skills/lsprag-def-tree
ln -sfn /absolute/path/to/lsprag-skills/skills/lsprag-reference-info ~/.codex/skills/lsprag-reference-info
```

For skill-specific API usage, see:

- `skills/lsprag-def-tree/references/deployment.md`
- `skills/lsprag-reference-info/references/deployment.md`

## OpenCode Integration

1. Install OpenCode CLI:

```bash
npm install -g opencode-ai
```

2. Install OpenCode tool SDK dependency (needed for custom tool smoke tests):

```bash
npm install --prefix ~/.config/opencode @opencode-ai/plugin
```

3. Link both skills into OpenCode:

```bash
REPO_ROOT="/absolute/path/to/lsprag-skills"
mkdir -p ~/.config/opencode/skill
ln -sfn "$REPO_ROOT/skills/lsprag-def-tree" ~/.config/opencode/skill/lsprag-def-tree
ln -sfn "$REPO_ROOT/skills/lsprag-reference-info" ~/.config/opencode/skill/lsprag-reference-info
```

4. Verify OpenCode can discover the skills:

```bash
opencode debug skill
```

## LSP Server Prerequisite

These skills rely on an LSP backend (for example `gopls` for Go).

Quick check from repo root:

```bash
gopls_path="$(./scripts/ensure-gopls.sh)"
"$gopls_path" serve
```

Manual install example:

```bash
go install golang.org/x/tools/gopls@latest
gopls serve
```

## AIDP (From `.env`)

If you use the same endpoint pattern as `llm-test.py`, load env first:

```bash
set -a
source /absolute/path/to/.env
set +a
```

Check required vars:

```bash
[ -n "$AIDP_AK" ] && echo "AIDP_AK exists" || echo "AIDP_AK missing"
[ -n "$AIDP_ENDPOINT" ] && echo "AIDP_ENDPOINT exists" || echo "AIDP_ENDPOINT missing"
```

Install custom provider dependency and run OpenCode with AIDP model:

```bash
npm install --prefix ~/.config/opencode @ai-sdk/openai-compatible
opencode run --agent summary --model aidp/gemini-2.5-pro "hello"
```

Note: `aidp/gemini-2.5-pro` works for plain model calls, but OpenCode tool-calling flows may fail with schema validation errors from the backend. For skill/tool smoke tests, keep using `opencode/gpt-5-nano` unless your AIDP backend supports OpenCode tool schemas.

## Tests

Run core + dependency checks:

```bash
npm run test
```

Run OpenCode smoke test:

```bash
npm run test:opencode
```

`test:opencode` runs `tests/opencode/def-tree.opencode.test.ts`.

Default model behavior:
- Default: `opencode/gpt-5-nano` (no external API key required).
- AIDP opt-in: set `OPENCODE_USE_AIDP=1` (or set `OPENCODE_TEST_MODEL=aidp/gemini-2.5-pro`).

Use another model if needed:

```bash
OPENCODE_TEST_MODEL=deepseek/deepseek-chat DEEPSEEK_API_KEY=... npm run test:opencode
```

```bash
OPENCODE_USE_AIDP=1 AIDP_AK=... AIDP_ENDPOINT=... npm run test:opencode
```
