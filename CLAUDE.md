# WAV Search — AI Agent Guide

Wheelchair Accessible Vehicle (WAV) search aggregator. Ingests listings from multiple sources,
normalizes data, and presents an analytics-first filter dashboard. Mobile-first, API-first.

**Built with AI assistance. AI-agnostic documentation — any capable AI agent can work here.**

---

## Architecture

```
apps/
  api/       Fastify REST API (TypeScript, Node 24)
  web/       Next.js 15 frontend (App Router, mobile-first)
  scraper/   Playwright + Claude AI scraper engine (TypeScript)
packages/
  types/     Shared TypeScript interfaces — source of truth for all data shapes
  db/        Prisma schema + client wrapper (PostgreSQL)
  config/    Shared tsconfig, ESLint configs
```

**Monorepo:** pnpm workspaces + Turborepo. Run everything from root.

**Infrastructure (Docker Compose):**
- PostgreSQL 17 — primary persistence (port 5432)
- Meilisearch v1.12 — search + faceted filtering, sub-100ms target (port 7700)
- Valkey 8 — caching (Redis-compatible, BSD license) (port 6379)

---

## Quick start

```bash
# Start infrastructure
docker compose up postgres valkey meilisearch -d

# Install deps
pnpm install

# Generate Prisma client + push schema
pnpm db:generate && pnpm db:push

# Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/scraper/.env.example apps/scraper/.env
cp apps/web/.env.example apps/web/.env

# Run all services in dev mode
pnpm dev
```

---

## Key design principles

1. **Single Responsibility** — files do one thing. Keep them small.
2. **Swappable dependencies** — storage, cache, and search are behind interfaces. Swap by changing the implementation, not the callers.
3. **API-first** — the web app is a client of the API. No direct DB access from the frontend.
4. **Mobile-first** — every UI decision starts with the mobile viewport.
5. **WCAG 2.1 AA** — accessibility is a hard requirement, not an afterthought.
6. **Open source licenses only** — MIT, Apache 2.0, BSD, PostgreSQL License. Never AGPL/GPL for runtime deps.

---

## Scraper architecture

Each source has a `SourceAdapter` in `apps/scraper/src/sources/`. The adapter implements:

- `checkStructure()` — fetches a sample page, hashes the DOM structure, compares to stored hash.
- `scrape()` — runs the full Playwright scrape, returns normalized listings.

If `checkStructure()` detects a change, `ScraperEngine` marks the source `needs_remapping` and calls
`StructureDetector` (Claude API) to derive new CSS selectors. The new mappings are stored in `sources.mappings`.

Sources run on independent cron schedules. One source failing never blocks another.

### Adding a new source

1. Create `apps/scraper/src/sources/<name>.ts` implementing `SourceAdapter`
2. Register it in `apps/scraper/src/index.ts`
3. Add a seed row to the `sources` table or upsert it on startup

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /v1/listings | Search listings with filters + aggregations |
| GET | /v1/listings/:id | Single listing detail |
| GET | /v1/sources | List configured scraper sources |

All responses: `{ data: T }` for success, `{ error: { code, message } }` for errors.

---

## Data model key fields

See `packages/types/src/listing.ts` for the complete `Listing` interface.

WAV-specific fields: `conversionType`, `conversionManufacturer`, `floorLoweringInches`,
`rampType`, `hasLift`, `handControls`, `transferSeat`, `wheelchairCapacity`

---

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):
- **All pushes/PRs:** typecheck → lint → test
- **Main branch only:** build + push Docker images to GitHub Container Registry (ghcr.io)

Images tagged with commit SHA and `latest`.

---

## Environment variables

See `.env.example` in each app directory. Never commit `.env` files.

Required secrets for CI: none beyond `GITHUB_TOKEN` (auto-provided) for image pushes.
Required for scraper: `ANTHROPIC_API_KEY`.

---

## Testing

- **Unit/integration:** Vitest (`pnpm test`)
- **E2E:** Playwright (future, `apps/web/e2e/`)

Test files live next to their source files: `foo.ts` → `foo.test.ts`.

---

## Potential SaaS spinouts (notes for future discussion)

- **Self-healing scraper engine** (`apps/scraper/src/engine/`) — the AI-powered structure detection + remapping is independently useful. Keep the interface boundary clean.
- **Analytics filter component** — the histogram + dual-slider filter pattern may be extractable as a standalone React component/library.
