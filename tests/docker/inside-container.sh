#!/usr/bin/env bash
set -euo pipefail

echo "Checking OpenCode install..."
opencode --version

echo "Checking Claude Code install..."
if command -v claude >/dev/null 2>&1; then
  claude --version || true
elif command -v claude-code >/dev/null 2>&1; then
  claude-code --version || true
else
  echo "Claude Code binary not found in PATH."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Installing skills..."
mkdir -p ~/.codex/skills ~/.claude/skills ~/.config/opencode/skill

ln -sfn /workspace/skills/lsprag-reference-info ~/.codex/skills/lsprag-reference-info
ln -sfn /workspace/skills/lsprag-def-tree ~/.codex/skills/lsprag-def-tree

ln -sfn /workspace/skills/lsprag-reference-info ~/.claude/skills/lsprag-reference-info
ln -sfn /workspace/skills/lsprag-def-tree ~/.claude/skills/lsprag-def-tree

ln -sfn /workspace/skills/lsprag-reference-info ~/.config/opencode/skill/lsprag-reference-info
ln -sfn /workspace/skills/lsprag-def-tree ~/.config/opencode/skill/lsprag-def-tree

echo "Running skill-only tests..."
npm run test

echo "Running OpenCode integration test..."
if [[ -n "${DEEPSEEK_API_KEY:-}" || -n "${OPENAI_API_KEY:-}" ]]; then
  npm run test:opencode
else
  echo "SKIP: missing DEEPSEEK_API_KEY or OPENAI_API_KEY"
fi
