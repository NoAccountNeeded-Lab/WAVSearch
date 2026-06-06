FROM node:24-alpine
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pin pnpm store inside the image so it's on the same filesystem as node_modules,
# enabling hard links instead of copies (avoids cross-mount slowness on startup).
ENV PNPM_STORE_DIR="/pnpm/store"
RUN apk add --no-cache git
RUN corepack enable && echo "store-dir=/pnpm/store" >> /root/.npmrc

WORKDIR /workspace

# Copy package manifests only — source code is bind-mounted at runtime.
# Changing any of these files invalidates this layer and triggers a reinstall.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/scraper/package.json apps/scraper/
COPY apps/web/package.json apps/web/
COPY packages/agents/package.json packages/agents/
COPY packages/charts/package.json packages/charts/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/

# BuildKit cache persists /pnpm/store across builds so subsequent installs
# only fetch what changed.
RUN --mount=type=cache,id=wivwav-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
