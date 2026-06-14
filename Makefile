COMPOSE = docker compose

.PHONY: up build down dev test test-integration typecheck lint build-app clean format logs \
        db-push db-generate db-migrate db-seed db-studio \
        job-detail-crawl job-detail-extract job-geocode \
        agents

# ── Docker stack ──────────────────────────────────────────────────────────────

## up     Start the complete Docker stack in the background — infra, api, web,
##        scraper, Ollama, and observability (Loki, Alloy, Grafana). Images are
##        built automatically on first run; use 'make build' to force a rebuild.
##        Grafana UI: http://localhost:3003
up:
	$(COMPOSE) --profile ai --profile obs up -d --remove-orphans

## build  Rebuild all Docker images without starting containers.
##        Run this after changing a Dockerfile or pulling new base images.
build:
	$(COMPOSE) --profile ai --profile obs build

## down   Stop all running containers and remove orphaned ones.
down:
	$(COMPOSE) --profile ai --profile obs down --remove-orphans

## logs   Tail live logs from all running containers. Press Ctrl-C to stop.
logs:
	$(COMPOSE) logs -f

# ── Local development ─────────────────────────────────────────────────────────

## dev    Start backing services (Postgres, Valkey, Meilisearch) in Docker,
##        apply pending migrations, then run api, web, and scraper locally
##        with hot reload. Ctrl-C stops the apps; services keep running.
##        Run 'make down' to stop backing services when done.
dev:
	$(COMPOSE) up postgres valkey meilisearch -d
	@[ -f packages/db/.env ] || cp packages/db/.env.example packages/db/.env
	@[ -f apps/scraper/.env ] || cp apps/scraper/.env.example apps/scraper/.env
	pnpm db:migrate
	pnpm dev

# ── Quality checks ────────────────────────────────────────────────────────────

## test              Run all unit tests across every package (Vitest, no containers).
test:
	pnpm test

## test-integration  Run scraper integration tests. Requires 'make dev' first
##                   for backing services (Postgres, Valkey).
test-integration:
	pnpm --filter @wivwav/scraper test:integration

## typecheck         Run TypeScript type checking across all packages without
##                   emitting any files. Catches type errors before committing.
typecheck:
	pnpm typecheck

## lint              Run ESLint across all packages. Fails on any lint error.
lint:
	pnpm lint

## format            Auto-format all source files with Prettier.
format:
	pnpm format

## build-app         Build production bundles for all apps (Next.js, API, scraper).
build-app:
	pnpm build

## clean             Delete all build output (.next, dist, out) across every package.
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

## db-studio           Open Prisma Studio in the browser for browsing and editing
##                     the local database. Requires 'make dev' first.
db-studio:
	pnpm --filter @wivwav/db db:studio

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
