# retrieve-def Skill Test + Improvement Report

Date: 2026-04-01  
Repo: `/home/guihuan/swe-playground/lsprag-skills`

## 1. Goal

Requested checks:

1. Instruction quality: whether `retrieve-def` is explained clearly enough for an agent to use.
2. Behavior quality: whether runtime behavior matches expected use.
3. Understandability: whether output is agent-friendly.
4. Feature updates:
   - Add optional `--line-range` argument with behavior: load all symbol definitions under that range.
   - Allow multiple symbol values.
5. Self-review and revision after implementation.

## 2. Baseline Findings (Before Patch)

### 2.1 Instruction Quality

Observed from `skills/lsprag/SKILL.md` and `README.md`:

- `retrieve-def` was documented for:
  - single `--symbol`
  - `--location <line>:<col>`
- No documented support for:
  - multiple symbols
  - line-range definition loading

Conclusion: instructions were clear for the old behavior, but incomplete for the requested new behavior.

### 2.2 Behavior Quality

Baseline command checks:

- `--symbol bar` worked.
- `--location 5:10` worked.
- `--symbol foo,bar` failed (`foo,bar` treated as one symbol string).
- `--line-range 3:18` was silently ignored (no effect).

Conclusion: behavior did not satisfy the new expected feature set.

### 2.3 Understandability (Agent-Friendliness)

Baseline output format was already good:

- Header includes symbol and source location: `# <symbol> (<path>:<line>:<col>)`
- Full source body is returned directly.

Gap: no way to batch-load multiple definitions or range-scoped definitions, which limits agent workflows.

## 3. Implemented Changes

## 3.1 `scripts/retrieve-def-cli.ts`

Main changes:

1. Added robust arg parsing:
   - Repeated args supported (`--symbol foo --symbol bar`)
   - Comma-separated symbol list supported (`--symbol foo,bar`)
2. Added `--line-range <start:end>`:
   - Scans identifiers in the inclusive line range.
   - Resolves and prints all unique definitions found.
   - Optional `--symbol` acts as filter in range mode.
3. Kept compatibility:
   - Single-symbol mode still works.
   - Location mode still works (`--location`).
4. Added validation:
   - Invalid location/range formatting errors.
   - `--location` and `--line-range` are mutually exclusive.
   - Range start beyond EOF reports a clear error.
5. Improved provider handling:
   - Uses configured provider when available.
   - Falls back to same-file symbol resolution.
6. Added deduplication:
   - Duplicate definition locations are printed once.

## 3.2 Documentation Updates

Updated:

- `skills/lsprag/SKILL.md`
- `README.md`
- `scripts/lsprag` examples/help section

Documentation now includes:

- multi-symbol usage
- location-only usage
- line-range usage + optional symbol filter

## 3.3 Test Updates

Updated `tests/cli.test.ts` with new `retrieve-def` cases:

1. multi-symbol (comma-separated)
2. multi-symbol (repeated flag)
3. line-range loads all defs in range
4. line-range + symbol filter

## 4. Verification Executed

### 4.1 Manual Behavior Checks (post-patch)

Passed:

- `--symbol foo,bar` returns both definitions.
- `--symbol foo --symbol bar` returns both definitions.
- `--line-range 14:17` returns `bar`, `qux`, `baz` definitions.
- `--line-range 14:17 --symbol qux --symbol baz` returns only `qux`, `baz`.
- `--location 5:10` still resolves correctly.

Expected error behavior confirmed:

- `--line-range` start after EOF => clear error.
- mixed missing symbol in direct symbol mode => clear error listing missing + available symbols.

### 4.2 Automated Tests

- `npm run test:cli` now reaches and passes all new retrieve-def assertions.
- Full suite status in this worktree is mixed due pre-existing unrelated changes:
  - `npm test` fails early at `tests/def-tree.core.test.ts` (assert mismatch unrelated to `retrieve-def` patch).
  - `npm run test:cli` later fails in token-defs area because current `token-defs-cli.ts` is LSP-only while existing test expectations still include regex-approval behavior.

These failures are outside the scope of the `retrieve-def` change itself.

## 5. Self-Review + Reflection

## 5.1 Error Found During Review

I introduced one syntax issue during first patch:

- Mixed `??` and `||` without parentheses.

Resolution:

- Replaced with nullish chain only:
  - from: `symbolNames[0] ?? fallbackWord || "symbol"`
  - to: `symbolNames[0] ?? fallbackWord ?? "symbol"`

Re-tested after fix; command execution succeeded.

## 5.2 Design Reasoning Summary

Key decisions:

1. Keep backward-compatible outputs so existing agent patterns remain stable.
2. Make range retrieval additive:
   - `--line-range` can run independently.
   - `--symbol` can narrow scope when needed.
3. Prefer deterministic output:
   - de-duplicate by location key
   - maintain discovered order
4. Validate arguments early with explicit error messages to keep agent behavior predictable.

## 6. Files Touched for This Task

- `scripts/retrieve-def-cli.ts`
- `tests/cli.test.ts`
- `skills/lsprag/SKILL.md`
- `README.md`
- `scripts/lsprag`
- `RETRIEVE_DEF_SKILL_TEST_REPORT.md` (this report)

## 7. Final Evaluation Against Requested Criteria

1. Instruction clarity: improved, now explicitly covers multi-symbol and line-range workflows.
2. Behavior expectation: implemented and manually validated for requested features.
3. Agent-friendliness: improved through batch retrieval support, filtering, and explicit errors.
4. Self-review + revision: completed (syntax issue detected and fixed).
