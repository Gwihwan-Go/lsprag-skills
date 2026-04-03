#!/usr/bin/env bash
# install-lsp-go.sh — install gopls (Go language server)
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

if command -v gopls &>/dev/null; then
  ok "gopls already installed: $(command -v gopls)"
  exit 0
fi

echo "Installing gopls..."
mkdir -p "$HOME/.local/bin"

# Try apt first (Debian/Ubuntu)
if command -v apt-get &>/dev/null; then
  if [ "$(id -u)" -eq 0 ]; then
    apt-get update -y >/dev/null 2>&1 || true
    if apt-get install -y gopls >/dev/null 2>&1; then
      ok "Installed gopls via apt"
      exit 0
    fi
  elif command -v sudo &>/dev/null; then
    sudo apt-get update -y >/dev/null 2>&1 || true
    if sudo apt-get install -y gopls >/dev/null 2>&1; then
      ok "Installed gopls via apt"
      exit 0
    fi
  fi
fi

# Try go install
if command -v go &>/dev/null; then
  if GOBIN="$HOME/.local/bin" GOPATH="$HOME/.local/go" \
    go install golang.org/x/tools/gopls@latest 2>&1; then
    ok "Installed gopls via go install → $HOME/.local/bin/gopls"
    exit 0
  fi
fi

# Check VS Code bundled gopls
shopt -s nullglob
for candidate in "$HOME"/.vscode/extensions/golang.go-*/bin/gopls \
                 "$HOME"/.vscode-server/extensions/golang.go-*/bin/gopls; do
  if [ -x "$candidate" ]; then
    ln -sf "$candidate" "$HOME/.local/bin/gopls"
    ok "Linked VS Code bundled gopls → $HOME/.local/bin/gopls"
    exit 0
  fi
done
shopt -u nullglob

err "Could not install gopls."
err "Install manually:"
err "  go install golang.org/x/tools/gopls@latest"
err "  # or: sudo apt-get install -y gopls"
exit 1
