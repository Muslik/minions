FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    openssh-client \
    curl \
    unzip \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://fnm.vercel.app/install \
  | bash -s -- --install-dir /usr/local/bin --skip-shell

RUN corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

WORKDIR /workspace
