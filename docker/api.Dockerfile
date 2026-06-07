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
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/queue ./packages/queue
COPY packages/search ./packages/search
COPY apps/api ./apps/api
RUN pnpm --filter @wivwav/types build
RUN pnpm --filter @wivwav/db generate
RUN pnpm --filter @wivwav/db build
RUN pnpm --filter @wivwav/queue build
RUN pnpm --filter @wivwav/search build
RUN pnpm --filter @wivwav/api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
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
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
