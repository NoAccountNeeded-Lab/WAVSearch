COMPOSE = docker compose

.PHONY: up up-full down dev test typecheck lint build-app logs \
        db-push db-generate db-migrate

# ── Infra services (Postgres, Valkey, Meilisearch) ────────────────────────────

# Start backing services only — app code runs locally with 'make dev'
up:
	$(COMPOSE) up postgres valkey meilisearch -d

# Full Docker stack — all services, including api/web/scraper (demo / CI smoke test)
up-full:
	$(COMPOSE) up --build --remove-orphans

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

build-app:
	pnpm build

# ── Database (run locally against the infra containers) ───────────────────────

db-push:
	pnpm db:push

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate
