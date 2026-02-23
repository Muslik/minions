#!/usr/bin/env bash
set -euo pipefail

REMOTE="netcup"
REMOTE_DIR="~/minions"

echo "==> Building backend..."
pnpm build

echo "==> Building UI..."
pnpm build:ui

echo "==> Syncing files to $REMOTE..."
rsync -azP --delete \
  dist/ "$REMOTE:$REMOTE_DIR/dist/"

rsync -azP --delete \
  ui/dist/ "$REMOTE:$REMOTE_DIR/ui/dist/"

rsync -azP \
  package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc \
  ecosystem.config.cjs \
  "$REMOTE:$REMOTE_DIR/"

rsync -azP \
  ui/package.json "$REMOTE:$REMOTE_DIR/ui/"

rsync -azP --delete \
  config/ "$REMOTE:$REMOTE_DIR/config/"

echo "==> Installing dependencies on remote..."
ssh "$REMOTE" "cd $REMOTE_DIR && pnpm install --frozen-lockfile --prod"

echo "==> Restarting PM2..."
ssh "$REMOTE" "cd $REMOTE_DIR && pm2 restart minions"

echo "==> Done!"
