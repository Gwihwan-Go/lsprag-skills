---
name: lsprag
description: Semantic code analysis for AI agents — actively analyze code structure, trace dependencies, and find callers before editing. Use these skills as your PRIMARY investigation tool, not as a supplement to grep/cat.
license: LICENSE
---

# LSPRAG — Adaptive Code Analysis

Use `lsprag` skills **actively and repeatedly** to understand code before making changes. These skills provide cross-file definitions, caller chains, and dependency maps that raw file reading cannot.

**Skill-First Policy**: Before you `cat` a file, before you `grep` for a symbol, before you edit — ask if a lsprag skill gives you the answer faster and more completely.

## The Analysis Loop

Do NOT follow a rigid step-by-step workflow. Instead, run this adaptive loop:

```
LOCATE → HYPOTHESIZE → INVESTIGATE → [confident?] → EDIT → VERIFY → SUBMIT
              ↑               | no
              └── BACKTRACK ──┘
```

### LOCATE
Extract from the issue: error messages, file paths, function names, stack traces. Use `find` and `grep` to locate candidate files. Then immediately use `listSymbols` on 2-3 candidate files to see what's inside. Output: a ranked list of 1-3 suspect (file, symbol) pairs.

### HYPOTHESIZE
Write a one-sentence hypothesis: "The bug is in `<function>` in `<file>` because `<reasoning>`."

### INVESTIGATE (use skills actively here)
Pick the right skill based on what you need to know (see Decision Framework below). After seeing the output, answer: **confirmed / refuted / inconclusive?**

- **Confirmed** → run `getReference` on the target to check edit impact. If still confident → EDIT.
- **Refuted** → BACKTRACK immediately.
- **Inconclusive** → run a different skill on the same symbol. If still inconclusive after 2 skill calls → BACKTRACK.

### BACKTRACK
Cross out the current hypothesis. Pick the next (file, symbol) pair. If your list is exhausted, re-run LOCATE with broader terms. After 3 failed hypotheses, re-read the issue from scratch looking for clues you missed.

### EDIT
Make the MINIMAL change. Rules:
- Run `getReference` on the symbol you're about to change (MANDATORY).
- If changing >1 file or >15 lines, STOP and reconsider — you're likely fixing a symptom, not the cause.

### VERIFY
Run a reproduction script. If the fix doesn't work, do NOT immediately re-edit. Return to HYPOTHESIZE with a new hypothesis informed by the failure.

## Active Decision Framework

Every time you encounter a new symbol, function, or file — **immediately** use the appropriate skill. Don't defer analysis.

### What do I need to know? → Use this skill:

| Question | Skill | Why |
|----------|-------|-----|
| What functions/classes are in this file? | `listSymbols --file <f>` | Quick overview before diving in |
| What does this function do and depend on? | `deep-think --file <f> --symbol <s> --depth 0` | Source + dependency list in one call |
| What is the full source of a function? | `getDefinition --file <f> --symbol <s>` | Complete function body |
| What identifiers does this function use and where defined? | `getTokens --file <f> --symbol <s>` | Maps every name to its definition |
| Who calls this function? What's the impact of changing it? | `getReference --file <f> --symbol <s>` | All callers across the codebase |
| Where does this function get called from? (trace the chain) | `callChain --file <f> --symbol <s>` | Recursive incoming caller chain |

### Automatic Triggers — use a skill when:

| Trigger | Action |
|---------|--------|
| You see a function name you haven't analyzed | `deep-think --depth 0` on it |
| You're about to read a file with `cat` | `listSymbols` first, then `getDefinition` on relevant functions |
| You found a suspect function | `getReference` to see who calls it |
| You're about to edit a function | `getTokens` to see all its dependencies first |
| Your fix didn't work | `callChain` to trace the actual execution path |
| You've spent >3 commands on one hypothesis without using a skill | STOP and run a skill now |

## Skill Reference

| Command | Input | Output | Time |
|---------|-------|--------|------|
| `deep-think --depth 0` | file, symbol | Function source + dependency list | ~3s |
| `getDefinition` | file, symbol | Full function/class source | ~2s |
| `getTokens` | file, symbol | All identifiers with definition locations | ~3s |
| `getReference` | file, symbol | All callers across codebase | ~4s |
| `listSymbols` | file | All functions/classes in the file | ~1s |
| `callChain` | file, symbol | Incoming call chain (recursive) | ~5s |

Always use `--depth 0` for deep-think to stay under output limits.

## Anti-Patterns

### Tunnel Vision
NEVER commit to your first file without verifying. If `grep` finds the error in File A, also check File B. Use `getReference` to see if the function in File A delegates to the real implementation elsewhere.

### Shotgun Editing
If you're about to edit >1 file, STOP. The fix is almost always in 1 file. Use `getReference` to understand impact. If you feel you need multiple files, you're probably fixing a symptom.

### Analysis Without Convergence
Running skills is not progress by itself. After each skill call, explicitly state whether your hypothesis is confirmed, refuted, or inconclusive. If you've run 3+ skills without confirming, backtrack.

### Skipping getReference Before Edit
ALWAYS run `getReference` on the symbol you're about to change. This tells you (a) whether other callers exist that your change might break, and (b) whether the bug might actually be in a caller.

### Reading Raw Code Instead of Using Skills
Don't `cat` a 200-line file and try to understand it by reading. Use `listSymbols` to see the structure, then `getDefinition` on the specific function you care about.

## Example Analysis Chains

### Simple: Wrong return value
Issue: "function X returns None instead of a list."
```
grep → find X in utils.py
listSymbols --file utils.py → see X at line 42
deep-think --file utils.py --symbol X --depth 0 → see missing return statement
getReference --file utils.py --symbol X → only 2 callers, safe to edit
EDIT: add return statement (1 line)
```

### Medium: Bug in a dependency
Issue: "method Y gives wrong result."
```
deep-think --file api.py --symbol Y --depth 0 → Y looks correct, calls helper Z
getDefinition --file helpers.py --symbol Z → spot the bug in Z's logic
getReference --file helpers.py --symbol Z → only called from Y, safe
EDIT: fix Z (3 lines)
```

### Hard: Wrong file initially
Issue: "error in module validation."
```
listSymbols --file validators.py → find validate_input()
deep-think --file validators.py --symbol validate_input --depth 0 → looks correct
BACKTRACK → new hypothesis: maybe in the caller
callChain --file validators.py --symbol validate_input → called from process_request()
deep-think --file handlers.py --symbol process_request --depth 0 → found the bug
getReference --file handlers.py --symbol process_request → check impact
EDIT: fix process_request
```

## Notes

- **Supported languages**: Python (`.py`), TypeScript/JavaScript (`.ts`, `.js`), Go (`.go`)
- All analysis uses real language servers — results are accurate across files.
- `deep-think` detects cycles to prevent infinite recursion.
- `getDefinition` returns type info for variables/constants via hover.
