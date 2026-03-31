#!/usr/bin/env bash
# update.sh — verify and repair lsprag installation
#
# Run this before using the lsprag skill to ensure everything is working.
# Called automatically by the SKILL.md prerequisite step.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${LSPRAG_SKILLS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
LSPRAG_BIN="$HOME/.local/bin/lsprag"
LSPRAG_SCRIPT="$ROOT/scripts/lsprag"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

echo "Checking lsprag installation (root: $ROOT)"
echo ""

# ── 1. npm deps ────────────────────────────────────────────────────────────────
if [ ! -d "$ROOT/node_modules" ]; then
  echo "Installing npm dependencies..."
  npm install --prefix "$ROOT" --silent
  ok "npm install done"
else
  ok "npm dependencies present"
fi

# ── 2. lsprag binary ──────────────────────────────────────────────────────────
if command -v lsprag &>/dev/null; then
  ok "lsprag found: $(command -v lsprag)"
else
  if [ -f "$LSPRAG_SCRIPT" ]; then
    chmod +x "$LSPRAG_SCRIPT"
    mkdir -p "$(dirname "$LSPRAG_BIN")"
    ln -sf "$LSPRAG_SCRIPT" "$LSPRAG_BIN"
    ok "Installed lsprag → $LSPRAG_BIN"
    warn "Add to PATH if not already: export PATH=\"\$HOME/.local/bin:\$PATH\""
  else
    err "lsprag script not found at $LSPRAG_SCRIPT"
    exit 1
  fi
fi

# ── 3. env vars ────────────────────────────────────────────────────────────────
if [ -z "${LSPRAG_SKILLS_ROOT:-}" ]; then
  warn "LSPRAG_SKILLS_ROOT is not set. Run: export LSPRAG_SKILLS_ROOT=\"$ROOT\""
else
  ok "LSPRAG_SKILLS_ROOT=$LSPRAG_SKILLS_ROOT"
fi

if [ -z "${LSPRAG_LSP_PROVIDER:-}" ]; then
  warn "LSPRAG_LSP_PROVIDER is not set (regex provider will be used as fallback)"
else
  ok "LSPRAG_LSP_PROVIDER=$LSPRAG_LSP_PROVIDER"
fi

# ── 4. smoke test ──────────────────────────────────────────────────────────────
FIXTURE="$ROOT/tests/fixtures/def-tree-sample.ts"
if [ -f "$FIXTURE" ]; then
  RESULT=$(LSPRAG_SKILLS_ROOT="$ROOT" "$LSPRAG_SCRIPT" def-tree \
    --file "$FIXTURE" --symbol foo 2>&1) || true
  if echo "$RESULT" | grep -q "bar"; then
    ok "smoke test passed: lsprag def-tree works"
  else
    err "smoke test failed. Output: $RESULT"
    exit 1
  fi
else
  warn "Fixture not found, skipping smoke test"
fi

echo ""
echo "Setup complete. lsprag is ready."
echo ""
echo "Try it:"
echo "  lsprag def-tree --file \"\$(realpath src/server.ts)\" --symbol handleRequest"
