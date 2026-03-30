#!/usr/bin/env bash
# install.sh — lsprag-skills install helper
# Detects Claude Code / OpenCode and wires up tools and skills.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }

echo "lsprag-skills installer"
echo "Repo root: $REPO_ROOT"
echo ""

# ── 1. npm install ────────────────────────────────────────────────────────────
echo "==> Installing npm dependencies..."
npm install --prefix "$REPO_ROOT" --silent
ok "npm install done"

# ── 2. Run tests ─────────────────────────────────────────────────────────────
echo "==> Running core tests..."
if npm run test --prefix "$REPO_ROOT" --silent 2>&1 | grep -q "PASS"; then
  ok "Core tests passed"
else
  warn "Some tests may have failed — check with: cd $REPO_ROOT && npm test"
fi

# ── 3. LSPRAG_SKILLS_ROOT env var ─────────────────────────────────────────────
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

export LSPRAG_SKILLS_ROOT="$REPO_ROOT"
if [ -n "$SHELL_RC" ]; then
  if ! grep -q "LSPRAG_SKILLS_ROOT" "$SHELL_RC"; then
    echo "" >> "$SHELL_RC"
    echo "# lsprag-skills" >> "$SHELL_RC"
    echo "export LSPRAG_SKILLS_ROOT=\"$REPO_ROOT\"" >> "$SHELL_RC"
    ok "Added LSPRAG_SKILLS_ROOT to $SHELL_RC"
  else
    ok "LSPRAG_SKILLS_ROOT already in $SHELL_RC"
  fi
else
  warn "Could not find .bashrc or .zshrc — set LSPRAG_SKILLS_ROOT manually:"
  warn "  export LSPRAG_SKILLS_ROOT=\"$REPO_ROOT\""
fi

# ── 4. Claude Code skills ─────────────────────────────────────────────────────
CLAUDE_SKILLS="$HOME/.claude/skills"
if command -v claude &>/dev/null || [ -d "$HOME/.claude" ]; then
  echo ""
  echo "==> Installing skills for Claude Code..."
  mkdir -p "$CLAUDE_SKILLS"
  for skill in lsprag-def-tree lsprag-reference-info lsprag-retrieve-defs lsprag-token-defs; do
    src="$REPO_ROOT/skills/$skill"
    dst="$CLAUDE_SKILLS/$skill"
    if [ -d "$src" ]; then
      rm -rf "$dst"
      cp -r "$src" "$dst"
      ok "  Installed $skill → $CLAUDE_SKILLS/$skill"
    fi
  done
  ok "Claude Code skills installed at $CLAUDE_SKILLS"
else
  warn "Claude Code not detected — skipping ~/.claude/skills install"
  warn "To install manually: cp -r $REPO_ROOT/skills/* ~/.claude/skills/"
fi

# ── 5. OpenCode tools ─────────────────────────────────────────────────────────
OPENCODE_TOOLS="$HOME/.config/opencode/tools"
if command -v opencode &>/dev/null || [ -d "$HOME/.config/opencode" ]; then
  echo ""
  echo "==> Installing tools for OpenCode..."
  mkdir -p "$OPENCODE_TOOLS"

  # Check for @opencode-ai/plugin
  PLUGIN_PATH="$HOME/.config/opencode/node_modules/@opencode-ai/plugin"
  if [ ! -d "$PLUGIN_PATH" ]; then
    echo "    Installing @opencode-ai/plugin..."
    npm install --prefix "$HOME/.config/opencode" @opencode-ai/plugin --silent 2>/dev/null || \
      warn "    Could not install @opencode-ai/plugin — run: npm install --prefix ~/.config/opencode @opencode-ai/plugin"
  fi

  cp "$REPO_ROOT/tools/lsprag_def_tree.ts" "$OPENCODE_TOOLS/lsprag_def_tree.ts"
  ok "  Installed lsprag_def_tree → $OPENCODE_TOOLS/lsprag_def_tree.ts"
  ok "OpenCode tools installed at $OPENCODE_TOOLS"
else
  warn "OpenCode not detected — skipping ~/.config/opencode/tools install"
  warn "To install manually:"
  warn "  mkdir -p ~/.config/opencode/tools"
  warn "  cp $REPO_ROOT/tools/lsprag_def_tree.ts ~/.config/opencode/tools/"
fi

echo ""
echo "============================================================"
echo "Installation complete!"
echo ""
echo "Test the CLI directly:"
echo "  npx tsx $REPO_ROOT/scripts/def-tree-cli.ts \\"
echo "    --file $REPO_ROOT/tests/fixtures/def-tree-sample.ts \\"
echo "    --symbol foo"
echo ""
echo "In Claude Code, ask:"
echo "  'Use \$lsprag-def-tree to show me the call tree for function X in file Y'"
echo ""
echo "In OpenCode, the lsprag_def_tree tool is available automatically."
echo "Make sure LSPRAG_SKILLS_ROOT is set:"
echo "  source $SHELL_RC  (or open a new terminal)"
echo "============================================================"
