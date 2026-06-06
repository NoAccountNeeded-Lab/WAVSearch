COMPOSE = docker compose

.PHONY: up up-full up-ai down dev test typecheck lint build-app clean format logs \
        db-push db-generate db-migrate db-seed \
        job-detail-crawl job-detail-extract job-geocode \
        agents

# ── Infra services ────────────────────────────────────────────────────────────

## up          Start Postgres, Valkey, and Meilisearch in Docker (background).
##             Use this before running 'make dev' to get the backing services up.
up:
	$(COMPOSE) up postgres valkey meilisearch -d

## up-full     Start the entire Docker stack (infra + api + web + scraper) from
##             scratch, rebuilding images. Useful for a demo or CI smoke test.
up-full:
	$(COMPOSE) up --build --remove-orphans

## up-ai       Start infra + Ollama (local LLM). Required when testing the
##             self-healing scraper engine locally without an Anthropic API key.
up-ai:
	$(COMPOSE) --profile ai up postgres valkey meilisearch ollama -d

## down        Stop all running containers and remove orphaned ones.
down:
	$(COMPOSE) down --remove-orphans

## logs        Tail live logs from the three infra containers (Postgres, Valkey,
##             Meilisearch). Press Ctrl-C to stop following.
logs:
	$(COMPOSE) logs -f postgres valkey meilisearch

# ── Local development ─────────────────────────────────────────────────────────

## dev         Apply pending migrations then start api, web, and scraper locally
##             with hot reload. Requires 'make up' first for backing services.
dev:
	pnpm db:migrate
	pnpm dev

# ── Quality checks ────────────────────────────────────────────────────────────

## test        Run all unit tests across every package (Vitest, no containers).
test:
	pnpm test

## typecheck   Run TypeScript type checking across all packages without emitting
##             any files. Catches type errors before committing.
typecheck:
	pnpm typecheck

## lint        Run ESLint across all packages. Fails on any lint error.
lint:
	pnpm lint

## format      Auto-format all source files with Prettier.
format:
	pnpm format

## build-app   Build production bundles for all apps (Next.js, API, scraper).
build-app:
	pnpm build

## clean       Delete all build output (.next, dist, out) across every package.
clean:
	pnpm clean

# ── Database ──────────────────────────────────────────────────────────────────

## db-generate         Regenerate the Prisma client after schema changes. Run this
##                     whenever you edit packages/db/prisma/schema.prisma.
db-generate:
	pnpm db:generate

## db-migrate          Apply all pending migrations (prisma migrate deploy).
##                     Runs automatically in Docker; use this for local applies
##                     after pulling new migration files from teammates.
db-migrate:
	pnpm db:migrate

## db-migrate-create   Create a versioned migration from your schema changes.
##                     Run this after editing schema.prisma instead of db-push.
##                     Prisma will prompt for a name.
db-migrate-create:
	pnpm db:migrate:create

## db-push             Sync schema directly to DB without a migration file.
##                     Dev shortcut only — use db-migrate-create for changes
##                     that need to be tracked and deployed.
db-push:
	pnpm db:push

## db-seed             Load WAV listing fixtures for local dev.
##                     Idempotent — safe to run multiple times.
db-seed:
	pnpm --filter @wivwav/db db:seed

# ── Scraper jobs ──────────────────────────────────────────────────────────────

## job-detail-crawl    Crawl individual listing detail pages for sources that
##                     require a second pass (e.g. to capture VIN or full specs).
job-detail-crawl:
	pnpm job:detail-crawl

## job-detail-extract  Run the AI extraction pass over previously crawled detail
##                     pages to pull structured data into the database.
job-detail-extract:
	pnpm job:detail-extract

## job-geocode         Geocode listings that have a city/state but no lat/lng,
##                     writing coordinates back to the database for map display.
job-geocode:
	pnpm job:geocode

# ── Agents CLI ────────────────────────────────────────────────────────────────

## agents      Run the agents CLI. Pass a command via ARGS.
##             Usage: make agents ARGS="<command> [options]"
agents:
	pnpm agents $(ARGS)
