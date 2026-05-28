COMPOSE = docker compose -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: up up-detached up-detatched down down-volumes logs test typecheck lint \
        db-push db-generate db-migrate \
        exec shell

# ── Container lifecycle ────────────────────────────────────────────────────────

# Builds if needed (cached — fast when nothing changed), then starts everything
up:
	$(COMPOSE) up --build

# Same as up but runs in the background — use 'make logs' to follow output
up-detached up-detatched:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

down-volumes:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f dev

# Open an interactive shell in the dev container
shell:
	$(COMPOSE) exec dev sh

# Run an arbitrary command in the container: make exec CMD="pnpm --filter api build"
exec:
	$(COMPOSE) exec dev $(CMD)

# ── Build / quality ────────────────────────────────────────────────────────────

test:
	$(COMPOSE) exec dev pnpm test

typecheck:
	$(COMPOSE) exec dev pnpm typecheck

lint:
	$(COMPOSE) exec dev pnpm lint

build-app:
	$(COMPOSE) exec dev pnpm build

# ── Database ───────────────────────────────────────────────────────────────────

db-push:
	$(COMPOSE) exec dev pnpm db:push

db-generate:
	$(COMPOSE) exec dev pnpm db:generate

db-migrate:
	$(COMPOSE) exec dev pnpm db:migrate
