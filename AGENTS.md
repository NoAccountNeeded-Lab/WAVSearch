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
make dev       # apply pending migrations, then start api, web, scraper with hot reload
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
| GET    | /v1/listings/:id/safety        | Safety summary (recalls, complaints, ratings) for a listing |
| GET    | /v1/vehicles/:make/:model/:year/recalls    | Open recalls for a vehicle           |
| GET    | /v1/vehicles/:make/:model/:year/complaints | Complaints for a vehicle             |
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

## Ops workflows

Everything below is done through the web UI at **http://localhost:3002/ops** — never via CLI during normal operations. Direct the user to the relevant page; don't paste curl commands.

### Get listings on the map

Listings need GPS coordinates to appear as pins on the search map. New scraped listings arrive without coordinates. The pipeline is:

1. **Scrape** — `/ops/sources` → "Run Now" on a source, or wait for its cron schedule.
2. **Geocode** — `/ops/queues` → find the `geocode` row → click **Trigger**. This resolves city + state → lat/lng for every ungeocoded listing. Rate-limited to 1 req/sec (Nominatim policy), but it deduplicates by unique city/state, so 4 000 listings in 200 distinct cities only fires 200 requests (~3–4 min), not 4 000.
3. **Sync Meilisearch** — same `/ops/queues` page → click **Sync Meilisearch** (top-right button). This re-indexes all listings from Postgres into Meilisearch so the new coordinates become searchable and visible on the map.

Geocode runs nightly at 2 AM; sync does **not** run automatically — you must trigger it after geocode completes if you want map pins without waiting.

### Scrape a source immediately

`/ops/sources` → "Run Now" next to the source. Progress appears on `/ops/runs` and in the queue activity panel on `/ops/queues`.

### Inspect a job or retry a failure

`/ops/queues` → click a queue name to expand live job activity. For full payloads and stack traces, use the **Bull Board** link (top-right of the Queues page).

### Trigger any background job immediately

`/ops/queues` → find the queue → **Trigger** (where available). Queues that can be triggered: `geocode`, `detail-crawl`, `detail-extract`, `deduplicate`.

### Enable, disable, or edit a schedule

`/ops/schedules` — lists all repeatable jobs with their current cron pattern, next run time, and enable/disable status. Toggle or edit any schedule without restarting the scraper. Changes take effect immediately in BullMQ/Valkey.

Schedules are stored in **Valkey** by BullMQ, not in node-cron or any config file. The scraper registers defaults on first boot only — subsequent restarts do not override user changes. Disabling a schedule removes it from BullMQ; it stays disabled across scraper restarts.

### Background job schedule (defaults)

| Queue                | Default schedule  | Notes |
| -------------------- | ----------------- | ----- |
| source-scrape        | Per-source (6–8h) | Configured on each Source row |
| detail-crawl         | Hourly            | Playwright; rate-limited to 1 page/2 s |
| detail-extract       | Every 5 min       | No network; reads stored HTML |
| geocode              | Nightly 2 AM      | Deduplicated by city/state |
| deduplicate          | Nightly 3 AM      | VIN-matched |
| vin-enrich           | Hourly :30        | NHTSA VIN decode → upsert VehicleModel |
| nhtsa-recalls        | Nightly 4 AM      | Recalls for all VehicleModels in inventory |
| nhtsa-complaints     | Weekly Sun 5 AM   | Complaints for all VehicleModels |
| nhtsa-safety-ratings | Weekly Sun 6 AM   | Safety ratings for all VehicleModels |

---

## Data model

See `packages/types/src/listing.ts` for the complete `Listing` interface.

WAV-specific fields: `conversionType`, `conversionManufacturer`, `floorLoweringInches`,
`rampType`, `hasLift`, `handControls`, `transferSeat`, `wheelchairCapacity`

### Schema changes

**Never use `make db-push` for schema changes that will be deployed.** Instead:

1. Edit `packages/db/prisma/schema.prisma`
2. Run `make db-migrate-create` — Prisma generates a `.sql` file in `prisma/migrations/`
3. Commit the migration file alongside the schema change
4. CI will reject PRs where the schema and migrations are out of sync
5. On deploy, the `migrate` Docker service applies pending migrations automatically before the API starts

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
