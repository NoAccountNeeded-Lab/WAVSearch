# WAVSearch

Wheelchair Accessible Vehicle (WAV) search aggregator. Ingests listings from multiple sources, normalizes data, and presents an analytics-first filter dashboard.

**Mobile-first. API-first. Open source.**

---

## What is WAVSearch?

Finding a wheelchair accessible vehicle is hard. Listings are scattered across dealer sites, classifieds, and specialty marketplaces — each with different formats and no standard data model.

WAVSearch scrapes, normalizes, and indexes WAV listings so buyers can filter by what actually matters: ramp type, floor lowering depth, conversion manufacturer, lift presence, hand controls, and more.

---

## Quick start

### Option A — Dev Container (recommended)

The repo ships with a [Dev Container](https://containers.dev/) configuration. Everything — Node, pnpm, PostgreSQL, Meilisearch, Valkey — starts automatically with no manual setup.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) and the [VS Code Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) (or [GitHub Codespaces](https://github.com/features/codespaces))

1. Clone the repo and open it in VS Code.
2. Click **"Reopen in Container"** when prompted (or run `Dev Containers: Reopen in Container` from the command palette).
3. Wait for the container build — `pnpm install`, Prisma client generation, and env file setup all run automatically.
4. Push the DB schema: `pnpm db:push`
5. Start dev servers: `pnpm dev`

To enable the AI scraper, add your `ANTHROPIC_API_KEY` to `apps/scraper/.env`.

---

### Option B — Local setup

**Prerequisites:** Docker, Node 24, pnpm 11

```bash
# 1. Start infrastructure (PostgreSQL, Meilisearch, Valkey)
docker compose up postgres valkey meilisearch -d

# 2. Install dependencies
pnpm install

# 3. Set up environment files
cp apps/api/.env.example apps/api/.env
cp apps/scraper/.env.example apps/scraper/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env

# 4. Generate Prisma client and push schema
pnpm db:generate && pnpm db:push

# 5. Run all services in dev mode
pnpm dev
```

---

| Service       | URL                   |
| ------------- | --------------------- |
| Web app       | http://localhost:3000 |
| API           | http://localhost:3001 |
| Meilisearch   | http://localhost:7700 |

---

## Architecture

```
apps/
  api/       Fastify REST API (TypeScript, Node 24)
  web/       Next.js 15 frontend (App Router, mobile-first)
  scraper/   Playwright + AI scraper engine
packages/
  types/     Shared TypeScript interfaces — source of truth for all data shapes
  db/        Prisma schema + client wrapper (PostgreSQL)
  config/    Shared tsconfig and ESLint configs
```

**Monorepo:** pnpm workspaces + Turborepo.

**Infrastructure:**

| Service        | Purpose                                      | Port |
| -------------- | -------------------------------------------- | ---- |
| PostgreSQL 17  | Primary persistence                          | 5432 |
| Meilisearch    | Full-text search + faceted filtering         | 7700 |
| Valkey 8       | Caching (Redis-compatible, BSD license)      | 6379 |

### Scraper

Each source has a `SourceAdapter` in `apps/scraper/src/sources/`. Adapters check DOM structure hashes on each run — if a site changes layout, the engine flags it and uses the Claude API to derive updated CSS selectors automatically.

### API routes

| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /health            | Health check                             |
| GET    | /v1/listings       | Search listings with filters             |
| GET    | /v1/listings/:id   | Single listing detail                    |
| GET    | /v1/sources        | List configured scraper sources          |

---

## Testing

```bash
pnpm test           # Unit tests (Vitest) — no network, no DB
pnpm typecheck      # TypeScript type check across all packages
```

Integration tests (require running services):

```bash
pnpm test:integration
```

---

## Contributing

1. Browse [open issues](../../issues) and pick one to work on.
2. Branch from `main`: `feat/issue-{N}-{short-slug}`
3. Keep commits atomic and reference the issue: `refs #N`
4. Tests and typecheck must pass before every commit.
5. Open a draft PR and link the issue.

See [CLAUDE.md](CLAUDE.md) for AI agent guidance and [docs/SDLC.md](docs/SDLC.md) for the full development workflow.

---

## Accessibility

WAVSearch targets **WCAG 2.1 AA** compliance. Accessibility is a hard requirement — this tool serves users who depend on accessible vehicles, and the tool itself should be accessible too.

---

## License

MIT
