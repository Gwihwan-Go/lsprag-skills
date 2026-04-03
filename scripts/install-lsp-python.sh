#!/usr/bin/env bash
# install-lsp-python.sh — install pylsp (Python language server)
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

if command -v pylsp &>/dev/null; then
  ok "pylsp already installed: $(command -v pylsp)"
  exit 0
fi

echo "Installing pylsp..."
mkdir -p "$HOME/.local/bin"

if command -v python3 &>/dev/null; then
  VENV="$HOME/.local/lsprag-pylsp-venv"
  if python3 -m venv "$VENV" 2>&1; then
    if "$VENV/bin/pip" install --quiet python-lsp-server 2>&1; then
      ln -sf "$VENV/bin/pylsp" "$HOME/.local/bin/pylsp"
      ok "Installed pylsp via venv → $HOME/.local/bin/pylsp"
      exit 0
    fi
  fi
fi

err "Could not install pylsp."
err "Install manually:"
err "  python3 -m venv ~/.local/lsprag-pylsp-venv"
err "  ~/.local/lsprag-pylsp-venv/bin/pip install python-lsp-server"
err "  ln -sf ~/.local/lsprag-pylsp-venv/bin/pylsp ~/.local/bin/pylsp"
exit 1
