# WAVSearch — Agent Guide

WAVSearch is a wheelchair accessible vehicle (WAV) listing aggregator. It scrapes listings from multiple sources, normalizes data, and presents an analytics-first filter dashboard — mobile-first, API-first.

**AI-agnostic. Any capable agent can work here.**

---

## Architecture

```
apps/
  api/       Fastify REST API (TypeScript, Node 24)
  web/       Next.js 15 frontend (App Router, mobile-first)
  scraper/   Playwright + Claude AI scraper engine
packages/
  types/     Shared TypeScript interfaces — source of truth for all data shapes
  db/        Prisma schema + client wrapper (PostgreSQL)
  config/    Shared tsconfig and ESLint configs
```

**Monorepo:** pnpm workspaces + Turborepo. Run everything from root.

**Infrastructure (Docker Compose):**

| Service       | Purpose                              | Port |
| ------------- | ------------------------------------ | ---- |
| PostgreSQL 17 | Primary persistence                  | 5432 |
| Meilisearch   | Full-text search + faceted filtering | 7700 |
| Valkey 8      | Caching (Redis-compatible)           | 6379 |

---

## Quick start

**Prerequisites:** Docker, Node 24, pnpm 11

```bash
# One-time setup
pnpm install
pnpm db:generate
cp apps/api/.env.example apps/api/.env
cp apps/scraper/.env.example apps/scraper/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env

# Each session
make up        # start Postgres, Valkey, Meilisearch in Docker
pnpm db:push   # push schema (first time, or after schema changes)
make dev       # start api, web, scraper locally with hot reload
```

| Service     | URL                   |
| ----------- | --------------------- |
| Web app     | http://localhost:3000 |
| API         | http://localhost:3001 |
| Meilisearch | http://localhost:7700 |

```bash
make down      # stop infra containers
make test      # run unit tests
make typecheck # type check all packages
make lint      # lint all packages
```

---

## How agents work

1. Pick an open issue: `gh issue list --state open`
2. Add `status:in-progress`, post a brief check-in comment
3. Branch off main: `git checkout main && git pull origin main && git checkout -b <prefix>/issue-{N}-{slug}`
4. Do the work — commit small and often once typecheck, lint, and tests pass
5. **Update AGENTS.md** if you added, removed, or renamed API routes (keep the routes table current)
6. Push and open a draft PR linking the issue
7. Run `/code-review`, address findings, then merge with **rebase** (`gh pr merge --rebase`)

Never work directly on `main`. Never commit on failing tests.

If the PR touches `apps/web`, read `docs/BRAND.md` before writing any UI code.

---

## Commit format

```
type(scope): description (refs #N)
```

Use `fixes #N` instead of `refs #N` when the commit fully completes the issue — GitHub auto-closes it on merge.

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

## Branch naming

| Issue type    | Prefix                      |
| ------------- | --------------------------- |
| Feature       | `feat/issue-{N}-{slug}`     |
| Bug fix       | `fix/issue-{N}-{slug}`      |
| Docs/process  | `docs/issue-{N}-{slug}`     |

---

## API routes

| Method | Path                           | Description                          |
| ------ | ------------------------------ | ------------------------------------ |
| GET    | /health                        | Health check                         |
| GET    | /v1/listings                   | Search listings with filters         |
| GET    | /v1/listings/facets            | Facet aggregations (cached 60s)      |
| GET    | /v1/listings/:id               | Single listing detail                |
| GET    | /v1/listings/:id/price-history | Listing price history                |
| GET    | /v1/sources                    | List configured scraper sources      |
| GET    | /admin/queues                  | All queue names with stats           |
| GET    | /admin/queues/:name            | Single queue stats + recent jobs     |
| POST   | /admin/queues/:name/jobs       | Enqueue a job                        |
| POST   | /admin/queues/:name/pause      | Pause a queue                        |
| POST   | /admin/queues/:name/resume     | Resume a queue                       |
| GET    | /admin/runs                    | Recent scraper runs (last 100) + sourceName |
| GET    | /admin/sources                 | Sources with status and listing count|
| POST   | /admin/sources/:id/run         | Enqueue an immediate source-scrape job |
| POST   | /admin/sync                    | Re-index all listings into Meilisearch |
| GET    | /admin/ai/status               | Ollama health + installed/loaded models + sources needing remap |
| GET    | /admin/board                   | Queue job inspector UI               |

All responses: `{ data: T }` for success, `{ error: { code, message } }` for errors.

---

## Data model

See `packages/types/src/listing.ts` for the complete `Listing` interface.

WAV-specific fields: `conversionType`, `conversionManufacturer`, `floorLoweringInches`,
`rampType`, `hasLift`, `handControls`, `transferSeat`, `wheelchairCapacity`

---

## Scraper architecture

Each source has a `SourceAdapter` in `apps/scraper/src/sources/` implementing:

- `checkStructure()` — fetches a sample page, hashes the DOM, compares to stored hash
- `scrape()` — runs the full Playwright scrape, returns normalized listings

If `checkStructure()` detects a change, the engine marks the source `needs_remapping` and calls the Claude API to derive new CSS selectors. Sources run on independent cron schedules.

**Pitfall inside `page.evaluate`:** tsx's esbuild wraps named arrow-function-to-const assignments with `__name()`, which is not defined in the Playwright browser sandbox. Use `function` declarations instead of `const fn = () => {}` inside `page.evaluate`.

### Adding a new source

1. Create `apps/scraper/src/sources/<name>.ts` implementing `SourceAdapter`
2. Register it in `apps/scraper/src/index.ts`
3. Add a seed row to the `sources` table or upsert it on startup

---

## Testing

- **Unit:** Vitest (`make test`) — no network, no DB. Fast.
- **Integration:** Vitest (`make exec CMD="pnpm test:integration"`) — hits real services.

Test files live next to source: `foo.ts` → `foo.test.ts`. Integration tests use `*.integration.test.ts`.

---

## CI/CD

- **All pushes:** typecheck → lint → test (`ci.yml`)
- **Main branch:** build + push Docker images to ghcr.io (`publish.yml`)

---

## Environment variables

See `.env.example` in each app directory. Never commit `.env` files.

- Scraper AI: `ANTHROPIC_API_KEY`
- CI: only `GITHUB_TOKEN` (auto-provided)
