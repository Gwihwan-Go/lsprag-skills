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

# ── 3. LSPRAG_LSP_PROVIDER env var ────────────────────────────────────────────
PROVIDER_PATH="$REPO_ROOT/providers/regex-provider.mjs"
export LSPRAG_LSP_PROVIDER="$PROVIDER_PATH"

if [ -n "$SHELL_RC" ]; then
  if ! grep -q "LSPRAG_LSP_PROVIDER" "$SHELL_RC"; then
    echo "" >> "$SHELL_RC"
    echo "# lsprag-skills provider" >> "$SHELL_RC"
    echo "export LSPRAG_LSP_PROVIDER=\"$PROVIDER_PATH\"" >> "$SHELL_RC"
    ok "Added LSPRAG_LSP_PROVIDER to $SHELL_RC"
  else
    ok "LSPRAG_LSP_PROVIDER already in $SHELL_RC"
  fi
else
  warn "No shell rc file found. Set LSPRAG_LSP_PROVIDER manually:"
  warn "  export LSPRAG_LSP_PROVIDER=\"$PROVIDER_PATH\""
fi

# ── 4. Check LSP servers ──────────────────────────────────────────────────────
echo ""
echo "==> Checking LSP servers..."
found_any=0
if command -v gopls &>/dev/null; then
  ok "gopls found: $(command -v gopls)"
  found_any=1
else
  warn "gopls not found (Go LSP)"
fi
if command -v tsserver &>/dev/null; then
  ok "tsserver found: $(command -v tsserver)"
  found_any=1
else
  warn "tsserver not found (TypeScript LSP)"
fi
if command -v pylsp &>/dev/null; then
  ok "pylsp found: $(command -v pylsp)"
  found_any=1
else
  warn "pylsp not found (Python LSP)"
fi
if [ "$found_any" -eq 0 ]; then
  warn "No LSP servers detected. Regex provider will be used by default."
  warn "To install LSP servers automatically: LSPRAG_INSTALL_LSP=1 bash $REPO_ROOT/install.sh"
fi

# ── 4b. Optional LSP install ──────────────────────────────────────────────────
if [ "${LSPRAG_INSTALL_LSP:-}" = "1" ]; then
  echo ""
  echo "==> Installing LSP servers (optional)..."
  mkdir -p "$HOME/.local/bin"

  # Go (gopls)
  if ! command -v gopls &>/dev/null; then
    if command -v apt-get &>/dev/null; then
      if [ "$(id -u)" -eq 0 ]; then
        apt-get update -y >/dev/null 2>&1 || true
        if apt-get install -y gopls >/dev/null 2>&1; then
          ok "Installed gopls (apt)"
        else
          warn "Failed to install gopls via apt"
        fi
      elif command -v sudo &>/dev/null; then
        sudo apt-get update -y >/dev/null 2>&1 || true
        if sudo apt-get install -y gopls >/dev/null 2>&1; then
          ok "Installed gopls (apt)"
        else
          warn "Failed to install gopls via apt"
        fi
      else
        warn "gopls not installed (need sudo/root or Go toolchain)"
      fi
    fi

    if ! command -v gopls &>/dev/null && command -v go &>/dev/null; then
      if GOBIN="$HOME/.local/bin" GOPATH="$HOME/.local/go" \
        go install golang.org/x/tools/gopls@latest >/dev/null 2>&1; then
        ok "Installed gopls (go install)"
      else
        warn "Failed to install gopls via go install"
      fi
    fi
  else
    ok "gopls already installed"
  fi

  # TypeScript (tsserver)
  if ! command -v tsserver &>/dev/null; then
    if command -v npm &>/dev/null; then
      if npm install -g typescript --prefix "$HOME/.local" --silent; then
        ok "Installed tsserver (npm)"
      else
        warn "Failed to install tsserver via npm"
      fi
    else
      warn "npm not found; cannot install tsserver"
    fi
  else
    ok "tsserver already installed"
  fi

  # Python (pylsp)
  if ! command -v pylsp &>/dev/null; then
    if command -v python3 &>/dev/null; then
      VENV="$HOME/.local/lsprag-pylsp-venv"
      if python3 -m venv "$VENV" >/dev/null 2>&1; then
        if "$VENV/bin/pip" install --quiet python-lsp-server; then
          ln -sf "$VENV/bin/pylsp" "$HOME/.local/bin/pylsp"
          ok "Installed pylsp (venv)"
        else
          warn "Failed to install pylsp in venv"
        fi
      else
        warn "Failed to create Python venv for pylsp"
      fi
    else
      warn "python3 not found; cannot install pylsp"
    fi
  else
    ok "pylsp already installed"
  fi
fi

# ── 5. Install lsprag binary ──────────────────────────────────────────────────
echo ""
echo "==> Installing lsprag CLI..."
LSPRAG_BIN="$HOME/.local/bin/lsprag"
chmod +x "$REPO_ROOT/scripts/lsprag"
mkdir -p "$(dirname "$LSPRAG_BIN")"
ln -sf "$REPO_ROOT/scripts/lsprag" "$LSPRAG_BIN"
ok "Installed lsprag → $LSPRAG_BIN"

# Ensure ~/.local/bin is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# Add to shell rc if missing
if [ -n "$SHELL_RC" ]; then
  if ! grep -q 'local/bin' "$SHELL_RC"; then
    echo "" >> "$SHELL_RC"
    echo '# lsprag-skills: add ~/.local/bin to PATH' >> "$SHELL_RC"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    ok "Added ~/.local/bin to PATH in $SHELL_RC"
  fi
fi

# ── 6. Verify lsprag works ────────────────────────────────────────────────────
echo ""
echo "==> Testing lsprag CLI..."
CLI_OUTPUT=$(LSPRAG_SKILLS_ROOT="$REPO_ROOT" "$REPO_ROOT/scripts/lsprag" def-tree \
  --file "$REPO_ROOT/tests/fixtures/def-tree-sample.ts" \
  --symbol foo 2>&1)
if echo "$CLI_OUTPUT" | grep -q "bar"; then
  ok "lsprag def-tree works"
else
  err "lsprag test failed. Output: $CLI_OUTPUT"
fi

# ── 7. Claude Code ────────────────────────────────────────────────────────────
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
  ok "  /lsprag --file path/to/file.ts --symbol myFn"
  ok "  (or just describe your task and Claude will invoke lsprag automatically)"
else
  warn "Claude Code not found. To install: https://claude.ai/code"
  warn "After installing, add to $SHELL_RC:"
  warn "  alias claude='claude --plugin-dir \"$REPO_ROOT\"'"
fi

# ── 8. OpenCode ────────────────────────────────────────────────────────────────
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

# ── 9. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "Installation complete!"
echo ""
echo "IMPORTANT: Open a new terminal (or run: source $SHELL_RC)"
echo "This activates LSPRAG_SKILLS_ROOT, LSPRAG_LSP_PROVIDER, and PATH."
echo ""
echo "Quick test (after opening a new terminal):"
echo "  lsprag def-tree \\"
echo "    --file \$LSPRAG_SKILLS_ROOT/tests/fixtures/def-tree-sample.ts \\"
echo "    --symbol foo"
echo ""
if command -v claude &>/dev/null; then
  echo "In Claude Code (after opening a new terminal):"
  echo "  claude"
  echo "  /lsprag --file path/to/file.ts --symbol myFn"
  echo ""
fi
if command -v opencode &>/dev/null; then
  echo "In OpenCode:"
  echo "  Use lsprag_def_tree tool with filePath and symbolName args"
  echo ""
fi
echo "Verify setup anytime: bash $REPO_ROOT/scripts/update.sh"
echo "Run all tests:        cd $REPO_ROOT && npm test"
echo "============================================================"
