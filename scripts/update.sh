#!/usr/bin/env bash
# update.sh — verify lsprag installation (read-only, never installs anything)
#
# Run this to check that lsprag is correctly set up.
# If something is missing, it tells you what to do — but never auto-installs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${LSPRAG_SKILLS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

problems=0

echo "Checking lsprag installation (root: $ROOT)"
echo ""

# ── 1. npm deps ──────────────────────────────────────────────────────────────
if [ -d "$ROOT/node_modules" ]; then
  ok "npm dependencies present"
else
  err "npm dependencies missing"
  warn "  Fix: npm install --prefix \"$ROOT\""
  problems=$((problems + 1))
fi

# ── 2. lsprag binary ─────────────────────────────────────────────────────────
if command -v lsprag &>/dev/null; then
  ok "lsprag found: $(command -v lsprag)"
else
  err "lsprag not found in PATH"
  warn "  Fix: bash \"$ROOT/install.sh\""
  problems=$((problems + 1))
fi

# ── 3. env vars ──────────────────────────────────────────────────────────────
if [ -n "${LSPRAG_SKILLS_ROOT:-}" ]; then
  ok "LSPRAG_SKILLS_ROOT=$LSPRAG_SKILLS_ROOT"
else
  warn "LSPRAG_SKILLS_ROOT is not set"
  warn "  Fix: export LSPRAG_SKILLS_ROOT=\"$ROOT\""
  problems=$((problems + 1))
fi

if [ -n "${LSPRAG_LSP_PROVIDER:-}" ]; then
  ok "LSPRAG_LSP_PROVIDER=$LSPRAG_LSP_PROVIDER"
else
  warn "LSPRAG_LSP_PROVIDER is not set (regex fallback will be used)"
fi

# ── 4. LSP servers (detect only) ─────────────────────────────────────────────
echo ""
echo "LSP servers:"
lsp_found=0
if command -v gopls &>/dev/null; then
  ok "gopls: $(command -v gopls)"
  lsp_found=$((lsp_found + 1))
else
  warn "gopls not found"
  warn "  Install: bash \"$ROOT/scripts/install-lsp-go.sh\""
fi
if command -v tsserver &>/dev/null; then
  ok "tsserver: $(command -v tsserver)"
  lsp_found=$((lsp_found + 1))
else
  warn "tsserver not found"
  warn "  Install: bash \"$ROOT/scripts/install-lsp-ts.sh\""
fi
if command -v pylsp &>/dev/null; then
  ok "pylsp: $(command -v pylsp)"
  lsp_found=$((lsp_found + 1))
else
  warn "pylsp not found"
  warn "  Install: bash \"$ROOT/scripts/install-lsp-python.sh\""
fi

# ── 5. smoke test ────────────────────────────────────────────────────────────
echo ""
FIXTURE="$ROOT/tests/fixtures/def-tree-sample.ts"
if [ -f "$FIXTURE" ] && command -v lsprag &>/dev/null; then
  RESULT=$(LSPRAG_SKILLS_ROOT="$ROOT" lsprag getDefinition \
    --file "$FIXTURE" --symbol bar 2>&1) || true
  if echo "$RESULT" | grep -q "bar"; then
    ok "smoke test passed"
  else
    err "smoke test failed. Output: $RESULT"
    problems=$((problems + 1))
  fi
else
  warn "Skipping smoke test (fixture or lsprag not available)"
fi

# ── summary ──────────────────────────────────────────────────────────────────
echo ""
if [ "$problems" -eq 0 ]; then
  echo "All checks passed. lsprag is ready."
else
  echo "$problems problem(s) found. Run: bash \"$ROOT/install.sh\""
fi
