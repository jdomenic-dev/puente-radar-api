# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Puente Radar API — Production Docker image
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install pnpm globally (pin version for reproducibility)
RUN npm install -g pnpm@9

WORKDIR /app

# Copy package manifests and lockfile first for better layer caching
COPY package.json pnpm-lock.yaml .npmrc ./

# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN pnpm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune && \
    rm -rf /root/.npm /tmp/*

# Copy compiled application from builder
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

# Default to production mode; override at runtime if needed
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main"]
