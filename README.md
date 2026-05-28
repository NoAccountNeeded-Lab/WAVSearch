# WAVSearch

Wheelchair Accessible Vehicle (WAV) search aggregator. Ingests listings from multiple sources, normalizes data, and presents an analytics-first filter dashboard.

**Mobile-first. API-first. Open source.**

---

## What is WAVSearch?

Finding a wheelchair accessible vehicle is hard. Listings are scattered across dealer sites, classifieds, and specialty marketplaces — each with different formats and no standard data model.

WAVSearch scrapes, normalizes, and indexes WAV listings so buyers can filter by what actually matters: ramp type, floor lowering depth, conversion manufacturer, lift presence, hand controls, and more.

---

## Quick start

Install Docker, then:

```bash
make up       # starts everything (builds the image on first run)
make db-push  # one time: set up the database schema
```

That's it. Open http://localhost:3000.

To stop: `make down`. To start again: `make up`.

### Optional: local AI layer for the self-healing scraper

The scraper can detect site layout changes and remap CSS selectors automatically using an AI model. The normal `make up` does **not** start the AI container — the scraper works fine without it.

**With Ollama (local, no API key needed):**

```bash
docker compose --profile ai up
```

This starts everything plus the Ollama container. The first run downloads the model (default: `llama3.2`, ~2 GB) and caches it to a named volume — subsequent starts are fast. Supported models: `llama3.2`, `qwen2.5`.

To use a different model:

```bash
OLLAMA_MODEL=qwen2.5 docker compose --profile ai up
```

**With Anthropic (production path):**

```bash
ANTHROPIC_API_KEY=sk-... make up
```

The scraper checks AI availability at the start of each scheduled run. If neither provider is reachable, scraping continues without AI-assisted remapping — sources with layout changes are flagged for manual review instead.

`OLLAMA_BASE_URL` is only needed for non-Docker Ollama installs (e.g. `http://localhost:11434`). In Docker Compose the service is reached automatically via its hostname.

---

## Working on the project

Everything runs in Docker, while the source tree stays bind-mounted from your machine. Dev services are split by responsibility:

- `web` runs the Next.js app.
- `api` runs the Fastify API.
- `scraper` runs scheduled scraper jobs.
- `workspace` is the long-running utility container used by `make shell`, tests, lint, typecheck, and database commands.
- `deps` is a one-shot setup container that installs dependencies into Docker volumes and generates the Prisma client.

Dependency volumes keep Linux package links and generated binaries out of the host checkout. Edit files on your machine and changes appear immediately without restarting.

```bash
make up             # start (rebuilds automatically if anything changed)
make down           # stop
make down-volumes   # full reset (wipes DB data and caches)
make reinstall      # rebuild and recreate dependency volumes
make logs           # follow api, web, and scraper logs
```

**Tests and checks** — all forwarded into the `workspace` container automatically:

```bash
make test           # unit tests
make typecheck      # TypeScript
make lint           # lint
make shell          # open a terminal inside the container
```

**If you add or update a dependency**, run the package manager from inside Docker, for example:

```bash
make exec CMD="pnpm --filter @wav-search/web add <package>"
```

If dependency volumes get stale, run `make reinstall`.

**If you change the database schema**, run `make db-push` after saving.

The web app uses `API_INTERNAL_URL=http://api:3001` for server-side rendering inside Docker and `NEXT_PUBLIC_API_URL=http://localhost:3001` for browser-side requests.

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
