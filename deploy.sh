#!/usr/bin/env bash
set -euo pipefail

REMOTE="netcup"
REMOTE_DIR="~/minions"

echo "==> Building backend..."
pnpm build

echo "==> Building UI..."
pnpm build:ui

echo "==> Packing and uploading..."
tar czf /tmp/minions-deploy.tar.gz \
  dist/ \
  ui/dist/ \
  ui/package.json \
  docker/ \
  config/ \
  package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc

scp /tmp/minions-deploy.tar.gz "$REMOTE:/tmp/"

echo "==> Extracting on remote and restarting..."
ssh "$REMOTE" "cd $REMOTE_DIR && tar xzf /tmp/minions-deploy.tar.gz && pnpm install --frozen-lockfile --prod && docker build -f docker/validator.Dockerfile -t minions-worker:latest . && pm2 restart minions && rm /tmp/minions-deploy.tar.gz"

rm /tmp/minions-deploy.tar.gz

echo "==> Done!"
