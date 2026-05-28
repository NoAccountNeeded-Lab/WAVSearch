# WAVSearch

Wheelchair Accessible Vehicle (WAV) search aggregator. Ingests listings from multiple sources, normalizes data, and presents an analytics-first filter dashboard.

**Mobile-first. API-first. Open source.**

---

## What is WAVSearch?

Finding a wheelchair accessible vehicle is hard. Listings are scattered across dealer sites, classifieds, and specialty marketplaces — each with different formats and no standard data model.

WAVSearch scrapes, normalizes, and indexes WAV listings so buyers can filter by what actually matters: ramp type, floor lowering depth, conversion manufacturer, lift presence, hand controls, and more.

---

## Quick start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) — no local Node or pnpm required.

```bash
# First run — builds the image and starts everything
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Push DB schema (once, or after schema changes)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec dev pnpm db:push

# Subsequent starts
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

All building and hot reload runs inside the container. Your source files are bind-mounted from your machine — edit locally, changes appear immediately.

| Service     | URL                   |
| ----------- | --------------------- |
| Web app     | http://localhost:3000 |
| API         | http://localhost:3001 |
| Meilisearch | http://localhost:7700 |

To enable the AI scraper, export `ANTHROPIC_API_KEY` in your shell before running `docker compose up`.

### Other options

- **VS Code Dev Container / Codespaces** — open in VS Code and click "Reopen in Container". Full IDE setup with extensions, no terminal commands needed. See [AGENTS.md](AGENTS.md) for details.
- **Local (no Docker for app)** — requires Node 24 + pnpm. See [AGENTS.md](AGENTS.md).

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
