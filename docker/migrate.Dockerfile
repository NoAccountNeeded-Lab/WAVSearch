FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile --filter @wivwav/db...

COPY packages/db ./packages/db
RUN pnpm --filter @wivwav/db generate

CMD ["pnpm", "--filter", "@wivwav/db", "migrate"]
