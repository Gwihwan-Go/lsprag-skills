FROM node:20-bullseye

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    unzip \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

# OpenCode install (official script)
RUN curl -fsSL https://opencode.ai/install | bash

# Claude Code install (official script)
RUN curl -fsSL https://claude.ai/install.sh | bash

# Some installers place binaries in ~/.local/bin
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /workspace
