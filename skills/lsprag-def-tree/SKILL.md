---
name: lsprag-def-tree
version: "0.1.0"
description: "Build a definition tree showing which functions/methods a symbol calls, and what those call in turn. Works on TypeScript, JavaScript, and Go files. No LSP server required — uses regex-based analysis."
argument-hint: 'lsprag-def-tree --file src/server.ts --symbol handleRequest'
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
      - definition-tree
      - typescript
      - go
---

# LSPRAG Definition Tree

Build a lightweight definition tree rooted at a target symbol. Shows which functions/methods are called at each level, up to a configurable depth.

## When to Use

- User asks "what does function X call?" or "show me the call chain for Y"
- You need to understand code structure before editing a function
- You want to map out dependencies before refactoring

## How to Invoke

Run the CLI script using the Bash tool. Follow these steps exactly:

### Step 1: Resolve the absolute file path

Always convert the file path to an absolute path before passing it to the CLI:

```bash
# If the user gave a relative path like "src/server.ts", resolve it:
realpath src/server.ts
# or
echo "$(pwd)/src/server.ts"
```

### Step 2: Locate LSPRAG_SKILLS_ROOT

```bash
# Check if LSPRAG_SKILLS_ROOT is set
echo "$LSPRAG_SKILLS_ROOT"
```

If it is empty or unset, find it:

```bash
# Try common install locations
ls ~/.lsprag-skills/scripts/def-tree-cli.ts 2>/dev/null && echo "found at ~/.lsprag-skills"
```

If found, set it for this session:

```bash
export LSPRAG_SKILLS_ROOT=~/.lsprag-skills
```

If NOT found, tell the user:
> LSPRAG_SKILLS_ROOT is not set and lsprag-skills is not installed.
> Please run: git clone https://github.com/Gwihwan-Go/lsprag-skills ~/.lsprag-skills && cd ~/.lsprag-skills && npm install && export LSPRAG_SKILLS_ROOT=~/.lsprag-skills

### Step 3: Run the CLI

```bash
npx tsx "$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts" \
  --file /absolute/path/to/source.ts \
  --symbol functionName \
  --depth 3
```

**All-in-one (resolves path automatically):**

```bash
LSPRAG_SKILLS_ROOT="${LSPRAG_SKILLS_ROOT:-$HOME/.lsprag-skills}" \
npx tsx "$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts" \
  --file "$(realpath path/to/source.ts)" \
  --symbol functionName \
  --depth 3
```

## Arguments

| Arg | Description | Required |
|-----|-------------|----------|
| `--file` | Absolute path to source file | Yes |
| `--symbol` | Function or method name to analyze | Yes |
| `--depth` | Max call depth to traverse (default: 3) | No |

## Example Output

```
handleRequest
├─ parseBody
│  └─ readStream
└─ sendResponse
   └─ formatJSON
```

## Notes

- Uses regex-based symbol detection — no LSP server required
- Supported languages: TypeScript, JavaScript (`.ts`, `.js`), Go (`.go`)
- If a symbol is not found, the CLI prints available symbols in the file
- For cross-file definition resolution with a real LSP server, see `skills/lsprag-def-tree/references/deployment.md`
