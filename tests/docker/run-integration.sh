#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "SKIP: docker is not installed."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="lsprag-skills-integration"

docker build -f "${REPO_ROOT}/tests/docker/Dockerfile" -t "${IMAGE_NAME}" "${REPO_ROOT}"

docker run --rm \
  -v "${REPO_ROOT}:/workspace" \
  -w /workspace \
  -e DEEPSEEK_API_KEY \
  -e OPENAI_API_KEY \
  "${IMAGE_NAME}" \
  bash tests/docker/inside-container.sh
