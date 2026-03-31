#!/usr/bin/env bash
# install.sh — lsprag-skills install helper
# Sets up the skills for Claude Code and/or OpenCode automatically.
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
echo "Repo: $REPO_ROOT"
echo ""

# ── 1. npm install ────────────────────────────────────────────────────────────
echo "==> Installing npm dependencies..."
npm install --prefix "$REPO_ROOT" --silent
ok "npm install done"

# ── 2. LSPRAG_SKILLS_ROOT env var ─────────────────────────────────────────────
export LSPRAG_SKILLS_ROOT="$REPO_ROOT"

SHELL_RC=""
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
  [ -f "$rc" ] && { SHELL_RC="$rc"; break; }
done

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
  warn "No shell rc file found. Set LSPRAG_SKILLS_ROOT manually:"
  warn "  export LSPRAG_SKILLS_ROOT=\"$REPO_ROOT\""
fi

# ── 3. Verify CLI script works ────────────────────────────────────────────────
echo ""
echo "==> Testing CLI script..."
CLI_OUTPUT=$(npx tsx "$REPO_ROOT/scripts/def-tree-cli.ts" \
  --file "$REPO_ROOT/tests/fixtures/def-tree-sample.ts" \
  --symbol foo 2>&1)
if echo "$CLI_OUTPUT" | grep -q "bar"; then
  ok "CLI script works (def-tree-cli.ts)"
else
  err "CLI script test failed. Output: $CLI_OUTPUT"
fi

# ── 4. Claude Code ────────────────────────────────────────────────────────────
if command -v claude &>/dev/null; then
  echo ""
  echo "==> Setting up Claude Code..."

  # Validate plugin structure
  if claude plugin validate "$REPO_ROOT" 2>&1 | grep -qi "passed\|valid"; then
    ok "Plugin structure valid"
  else
    warn "Plugin validation inconclusive — proceeding"
  fi

  # Add shell alias for persistent plugin-dir
  if [ -n "$SHELL_RC" ]; then
    if ! grep -q "lsprag.*plugin-dir" "$SHELL_RC"; then
      echo "" >> "$SHELL_RC"
      echo "# lsprag-skills: load skills for every claude session" >> "$SHELL_RC"
      echo "alias claude='claude --plugin-dir \"$REPO_ROOT\"'" >> "$SHELL_RC"
      ok "Added claude alias with --plugin-dir to $SHELL_RC"
    else
      ok "Claude alias already configured in $SHELL_RC"
    fi
  fi

  ok "Claude Code ready. Start a new shell, then run:"
  ok "  claude"
  ok "  /lsprag-def-tree --file path/to/file.ts --symbol myFn"
else
  warn "Claude Code not found. To install: https://claude.ai/code"
  warn "After installing, add to $SHELL_RC:"
  warn "  alias claude='claude --plugin-dir \"$REPO_ROOT\"'"
fi

# ── 5. OpenCode ────────────────────────────────────────────────────────────────
OPENCODE_TOOLS="$HOME/.config/opencode/tools"
if command -v opencode &>/dev/null || [ -d "$HOME/.config/opencode" ]; then
  echo ""
  echo "==> Setting up OpenCode..."
  mkdir -p "$OPENCODE_TOOLS"

  # Install @opencode-ai/plugin if missing
  PLUGIN_PATH="$HOME/.config/opencode/node_modules/@opencode-ai/plugin"
  if [ ! -d "$PLUGIN_PATH" ]; then
    echo "    Installing @opencode-ai/plugin..."
    npm install --prefix "$HOME/.config/opencode" @opencode-ai/plugin --silent 2>/dev/null && \
      ok "  Installed @opencode-ai/plugin" || \
      warn "  Could not install @opencode-ai/plugin. Run manually: npm install --prefix ~/.config/opencode @opencode-ai/plugin"
  else
    ok "  @opencode-ai/plugin already installed"
  fi

  cp "$REPO_ROOT/tools/lsprag_def_tree.ts" "$OPENCODE_TOOLS/lsprag_def_tree.ts"
  ok "  Installed lsprag_def_tree → $OPENCODE_TOOLS/lsprag_def_tree.ts"
  ok "OpenCode ready. Restart OpenCode, then use the lsprag_def_tree tool."
else
  warn "OpenCode not detected. To install: npm install -g opencode-ai"
  warn "After installing, copy tool:"
  warn "  mkdir -p ~/.config/opencode/tools"
  warn "  cp $REPO_ROOT/tools/lsprag_def_tree.ts ~/.config/opencode/tools/"
fi

# ── 6. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "Installation complete!"
echo ""
echo "IMPORTANT: Open a new terminal (or run: source $SHELL_RC)"
echo "This activates the LSPRAG_SKILLS_ROOT env var."
echo ""
echo "Quick test (run after opening a new terminal):"
echo "  npx tsx \$LSPRAG_SKILLS_ROOT/scripts/def-tree-cli.ts \\"
echo "    --file \$LSPRAG_SKILLS_ROOT/tests/fixtures/def-tree-sample.ts \\"
echo "    --symbol foo"
echo ""
if command -v claude &>/dev/null; then
  echo "In Claude Code (after opening a new terminal):"
  echo "  /lsprag-def-tree --file path/to/file.ts --symbol myFn"
  echo ""
fi
if command -v opencode &>/dev/null; then
  echo "In OpenCode:"
  echo "  Use lsprag_def_tree tool with filePath and symbolName args"
  echo ""
fi
echo "Run all tests: cd $REPO_ROOT && npm test"
echo "============================================================"
