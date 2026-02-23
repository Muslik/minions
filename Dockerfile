FROM node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/
RUN pnpm install --frozen-lockfile

# Copy source and build backend
COPY tsconfig.json tsconfig.app.json ./
COPY src/ ./src/
RUN pnpm build

# Build UI
FROM node:20-slim AS ui-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/
RUN pnpm install --frozen-lockfile --filter minions-ui

COPY ui/ ./ui/
RUN pnpm --filter minions-ui build

# Production stage
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=ui-builder /app/ui/dist ./ui/dist
COPY config/ ./config/

# Create data directories
RUN mkdir -p /app/data /app/artifacts /app/repos /app/workspaces

EXPOSE 3000

CMD ["node", "dist/index.js"]
