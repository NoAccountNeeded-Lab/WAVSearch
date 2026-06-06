# WivWav

Wheelchair accessible vehicle (WAV) search aggregator. Scrapes listings from multiple sources, normalizes data, and presents an analytics-first filter dashboard — mobile-first, API-first.

**No sign-up required to search.**

---

## What is WivWav?

Finding a wheelchair accessible vehicle is hard. Listings are scattered across dealer sites, classifieds, and specialty marketplaces — each with different formats and no standard data model.

WivWav scrapes, normalizes, and indexes WAV listings so buyers can filter by what actually matters: ramp type, floor lowering depth, conversion manufacturer, lift presence, hand controls, and more.

---

## Running it

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
make dev       # start api, web, scraper with hot reload
```

| Service     | URL                   |
| ----------- | --------------------- |
| Web app     | http://localhost:3000 |
| API         | http://localhost:3001 |
| Meilisearch | http://localhost:7700 |

```bash
make down      # stop infra
make test      # unit tests
make typecheck # type check
make lint      # lint
```

### Optional: local AI for the self-healing scraper

The scraper can detect site layout changes and remap CSS selectors using an AI model. Normal `make dev` works fine without it.

**Ollama (local, no API key):**
```bash
docker compose --profile ai up
```
Downloads and caches the model on first run (~2 GB). Use `OLLAMA_MODEL=qwen2.5` to override.

**Anthropic (production):**
Set `ai.scraper.structure.provider` and `ai.scraper.structure.apiKeyId` in the config DB via `/ops/ai`. The API key is stored encrypted — no env var needed.

If neither provider is reachable, scraping continues without AI remapping — layout-changed sources are flagged for manual review.

---

## Where to find things

```
apps/
  api/       Fastify REST API (TypeScript, Node 24)
  web/       Next.js 15 frontend (App Router)
  scraper/   Playwright + AI scraper engine
packages/
  types/     Shared TypeScript interfaces
  db/        Prisma schema + client (PostgreSQL)
  config/    Shared tsconfig and ESLint configs
```

- [Scraper: running and pipeline docs](apps/scraper/README.md)
- [AGENTS.md](AGENTS.md) — architecture details and agent workflow

---

## Accessibility

WivWav targets **WCAG 2.1 AA** compliance. This tool serves users who depend on accessible vehicles — the tool itself should be accessible too.

---

## License

MIT
