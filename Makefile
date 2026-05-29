COMPOSE = docker compose

.PHONY: up up-full up-ai down dev test typecheck lint build-app clean format logs \
        db-push db-generate db-migrate \
        job-detail-crawl job-detail-extract job-geocode \
        agents

# ── Infra services (Postgres, Valkey, Meilisearch) ────────────────────────────

# Start backing services only — app code runs locally with 'make dev'
up:
	$(COMPOSE) up postgres valkey meilisearch -d

# Full Docker stack — all services, including api/web/scraper (demo / CI smoke test)
up-full:
	$(COMPOSE) up --build --remove-orphans

# Infra + Ollama (local AI model for self-healing scraper engine)
up-ai:
	$(COMPOSE) --profile ai up postgres valkey meilisearch ollama -d

down:
	$(COMPOSE) down --remove-orphans

logs:
	$(COMPOSE) logs -f postgres valkey meilisearch

# ── Local development ─────────────────────────────────────────────────────────

dev:
	pnpm dev

# ── Quality checks (run locally — no containers required) ─────────────────────

test:
	pnpm test

typecheck:
	pnpm typecheck

lint:
	pnpm lint

format:
	pnpm format

build-app:
	pnpm build

clean:
	pnpm clean

# ── Database (run locally against the infra containers) ───────────────────────

db-push:
	pnpm db:push

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

# ── Scraper jobs (run locally against the infra containers) ───────────────────

job-detail-crawl:
	pnpm job:detail-crawl

job-detail-extract:
	pnpm job:detail-extract

job-geocode:
	pnpm job:geocode

# ── Agents CLI ────────────────────────────────────────────────────────────────

# Usage: make agents ARGS="<command> [options]"
agents:
	pnpm agents $(ARGS)
