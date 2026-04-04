#!/usr/bin/env bash
# install.sh — one-time lsprag-skills setup
#
# Installs: npm deps, lsprag CLI, env vars, LSP servers for detected languages,
# and configures Claude Code / OpenCode if present.
#
# Safe to re-run — every step is idempotent.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }
header() { echo -e "\n${BOLD}==> $*${NC}"; }

echo "lsprag-skills installer"
echo "Repo: $REPO_ROOT"

# ── 1. npm install ────────────────────────────────────────────────────────────
header "Installing npm dependencies"
npm install --prefix "$REPO_ROOT" --silent
ok "npm install done"

# ── 2. LSPRAG_SKILLS_ROOT env var ────────────────────────────────────────────
header "Setting environment variables"
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
  warn "No shell rc file found. Set manually:"
  warn "  export LSPRAG_SKILLS_ROOT=\"$REPO_ROOT\""
fi

# ── 3. LSPRAG_LSP_PROVIDER env var ──────────────────────────────────────────
PROVIDER_PATH="$REPO_ROOT/providers/lsp-client.ts"
export LSPRAG_LSP_PROVIDER="$PROVIDER_PATH"

if [ -n "$SHELL_RC" ]; then
  if ! grep -q "LSPRAG_LSP_PROVIDER" "$SHELL_RC"; then
    echo "export LSPRAG_LSP_PROVIDER=\"$PROVIDER_PATH\"" >> "$SHELL_RC"
    ok "Added LSPRAG_LSP_PROVIDER to $SHELL_RC"
  else
    ok "LSPRAG_LSP_PROVIDER already in $SHELL_RC"
  fi
fi

# ── 4. Install lsprag CLI ────────────────────────────────────────────────────
header "Installing lsprag CLI"
LSPRAG_BIN="$HOME/.local/bin/lsprag"
chmod +x "$REPO_ROOT/scripts/lsprag"
mkdir -p "$(dirname "$LSPRAG_BIN")"
ln -sf "$REPO_ROOT/scripts/lsprag" "$LSPRAG_BIN"
ok "Installed lsprag → $LSPRAG_BIN"
export PATH="$HOME/.local/bin:$PATH"

if [ -n "$SHELL_RC" ]; then
  if ! grep -q 'local/bin' "$SHELL_RC"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    ok "Added ~/.local/bin to PATH in $SHELL_RC"
  fi
fi

# ── 5. Smoke test ────────────────────────────────────────────────────────────
header "Smoke test"
CLI_OUTPUT=$(LSPRAG_SKILLS_ROOT="$REPO_ROOT" "$REPO_ROOT/scripts/lsprag" getDefinition \
  --file "$REPO_ROOT/tests/fixtures/def-tree-sample.ts" \
  --symbol bar 2>&1) || true
if echo "$CLI_OUTPUT" | grep -q "bar"; then
  ok "lsprag getDefinition works"
else
  err "lsprag smoke test failed. Output: $CLI_OUTPUT"
fi

# ── 6. Install LSP servers ───────────────────────────────────────────────────
header "Installing LSP servers"

# Detect which languages are used in the current project (parent of skill root,
# or the directory the user is in when running install.sh).
PROJECT_ROOT="${LSPRAG_PROJECT_ROOT:-$(pwd)}"

detect_lang() {
  local ext="$1" name="$2"
  # Check in skill repo fixtures + in the user's project
  if find "$REPO_ROOT" -maxdepth 4 -name "*.$ext" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi
  if [ "$PROJECT_ROOT" != "$REPO_ROOT" ] && \
     find "$PROJECT_ROOT" -maxdepth 4 -name "*.$ext" -not -path "*/node_modules/*" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

install_count=0
skip_count=0

# Go
if detect_lang "go" "Go"; then
  echo "  Detected Go files — installing gopls..."
  if bash "$REPO_ROOT/scripts/install-lsp-go.sh"; then
    install_count=$((install_count + 1))
  fi
elif command -v go &>/dev/null; then
  echo "  Go toolchain found — installing gopls..."
  if bash "$REPO_ROOT/scripts/install-lsp-go.sh"; then
    install_count=$((install_count + 1))
  fi
else
  skip_count=$((skip_count + 1))
fi

# TypeScript / JavaScript
if detect_lang "ts" "TypeScript" || detect_lang "js" "JavaScript"; then
  echo "  Detected TS/JS files — installing tsserver..."
  if bash "$REPO_ROOT/scripts/install-lsp-ts.sh"; then
    install_count=$((install_count + 1))
  fi
elif command -v node &>/dev/null; then
  echo "  Node.js found — installing tsserver..."
  if bash "$REPO_ROOT/scripts/install-lsp-ts.sh"; then
    install_count=$((install_count + 1))
  fi
else
  skip_count=$((skip_count + 1))
fi

# Python
if detect_lang "py" "Python"; then
  echo "  Detected Python files — installing pylsp..."
  if bash "$REPO_ROOT/scripts/install-lsp-python.sh"; then
    install_count=$((install_count + 1))
  fi
elif command -v python3 &>/dev/null; then
  echo "  Python3 found — installing pylsp..."
  if bash "$REPO_ROOT/scripts/install-lsp-python.sh"; then
    install_count=$((install_count + 1))
  fi
else
  skip_count=$((skip_count + 1))
fi

if [ "$install_count" -gt 0 ]; then
  ok "$install_count LSP server(s) installed"
fi
if [ "$skip_count" -gt 0 ]; then
  warn "$skip_count language(s) not detected — skipped their LSP servers"
  warn "Install individually later: bash scripts/install-lsp-{go,ts,python}.sh"
fi

# ── 7. Claude Code ───────────────────────────────────────────────────────────
if command -v claude &>/dev/null; then
  header "Setting up Claude Code"
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
  ok "Claude Code ready"
fi

# ── 8. OpenCode ──────────────────────────────────────────────────────────────
OPENCODE_TOOLS="$HOME/.config/opencode/tools"
if command -v opencode &>/dev/null || [ -d "$HOME/.config/opencode" ]; then
  header "Setting up OpenCode"
  mkdir -p "$OPENCODE_TOOLS"
  PLUGIN_PATH="$HOME/.config/opencode/node_modules/@opencode-ai/plugin"
  if [ ! -d "$PLUGIN_PATH" ]; then
    npm install --prefix "$HOME/.config/opencode" @opencode-ai/plugin --silent 2>/dev/null && \
      ok "Installed @opencode-ai/plugin" || \
      warn "Could not install @opencode-ai/plugin"
  fi
  if [ -f "$REPO_ROOT/tools/lsprag_def_tree.ts" ]; then
    cp "$REPO_ROOT/tools/lsprag_def_tree.ts" "$OPENCODE_TOOLS/lsprag_def_tree.ts"
    ok "Installed lsprag_def_tree → $OPENCODE_TOOLS/"
  fi
  ok "OpenCode ready"
fi

# ── 9. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "Installation complete!"
echo ""
if [ -n "$SHELL_RC" ]; then
  echo "Open a new terminal (or run: source $SHELL_RC)"
fi
echo ""
echo "Quick test:"
echo "  lsprag getDefinition \\"
echo "    --file \$LSPRAG_SKILLS_ROOT/tests/fixtures/def-tree-sample.ts \\"
echo "    --symbol bar"
echo ""
echo "Verify anytime:  bash $REPO_ROOT/scripts/update.sh"
echo "Run all tests:   cd $REPO_ROOT && npm test"
echo "============================================================"
