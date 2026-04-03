#!/usr/bin/env bash
# install-lsp-ts.sh — install tsserver (TypeScript language server)
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

if command -v tsserver &>/dev/null; then
  ok "tsserver already installed: $(command -v tsserver)"
  exit 0
fi

echo "Installing tsserver..."
mkdir -p "$HOME/.local/bin"

if command -v npm &>/dev/null; then
  if npm install -g typescript --prefix "$HOME/.local" --silent 2>&1; then
    ok "Installed tsserver via npm → $HOME/.local/bin/tsserver"
    exit 0
  fi
fi

err "Could not install tsserver."
err "Install manually:"
err "  npm install -g typescript --prefix \"\$HOME/.local\""
exit 1
