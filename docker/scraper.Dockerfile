FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/db/prisma/schema.prisma ./packages/db/prisma/
COPY packages/queue/package.json ./packages/queue/
COPY packages/search/package.json ./packages/search/
COPY packages/agents/package.json ./packages/agents/
COPY apps/scraper/package.json ./apps/scraper/
RUN pnpm install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY packages/search ./packages/search
COPY packages/agents ./packages/agents
COPY apps/scraper ./apps/scraper
RUN pnpm --filter @wivwav/types build
RUN pnpm --filter @wivwav/db generate
RUN pnpm --filter @wivwav/db build
RUN pnpm --filter @wivwav/queue build
RUN pnpm --filter @wivwav/search build
RUN pnpm --filter @wivwav/agents build
RUN pnpm --filter @wivwav/scraper build

FROM mcr.microsoft.com/playwright:v1.60.0-noble AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/scraper/node_modules ./apps/scraper/node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder /app/packages/queue/dist ./packages/queue/dist
COPY --from=builder /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=builder /app/packages/queue/node_modules ./packages/queue/node_modules
COPY --from=builder /app/packages/search/dist ./packages/search/dist
COPY --from=builder /app/packages/search/package.json ./packages/search/package.json
COPY --from=builder /app/packages/agents/dist ./packages/agents/dist
COPY --from=builder /app/packages/agents/package.json ./packages/agents/package.json
COPY --from=builder /app/apps/scraper/dist ./apps/scraper/dist
COPY --from=builder /app/apps/scraper/package.json ./apps/scraper/

CMD ["node", "apps/scraper/dist/index.js"]
