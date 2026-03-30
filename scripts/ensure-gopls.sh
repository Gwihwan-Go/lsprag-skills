#!/usr/bin/env bash
set -euo pipefail

if command -v gopls >/dev/null 2>&1; then
  echo "$(command -v gopls)"
  exit 0
fi

shopt -s nullglob
for candidate in "$HOME"/.vscode/extensions/golang.go-*/bin/gopls; do
  if [ -x "$candidate" ]; then
    echo "$candidate"
    exit 0
  fi
done
for candidate in "$HOME"/.vscode-server/extensions/golang.go-*/bin/gopls; do
  if [ -x "$candidate" ]; then
    echo "$candidate"
    exit 0
  fi
done
shopt -u nullglob

if command -v go >/dev/null 2>&1; then
  go install golang.org/x/tools/gopls@latest
  gopath="$(go env GOPATH)"
  echo "${gopath}/bin/gopls"
  exit 0
fi

echo "gopls not found. Install Go first: https://go.dev/doc/install" >&2
exit 1
