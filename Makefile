COMPOSE = docker compose -f docker-compose.yml -f docker-compose.dev.yml
DEV_NODE_MODULES_VOLUMES = \
	wavsearch_dev_root_node_modules \
	wavsearch_dev_api_node_modules \
	wavsearch_dev_scraper_node_modules \
	wavsearch_dev_web_node_modules \
	wavsearch_dev_agents_node_modules \
	wavsearch_dev_charts_node_modules \
	wavsearch_dev_config_node_modules \
	wavsearch_dev_db_node_modules \
	wavsearch_dev_types_node_modules \
	wavsearch_dev_node_modules

.PHONY: up up-detached up-detatched down down-volumes reinstall logs test typecheck lint \
        db-push db-generate db-migrate \
        exec shell

# ── Container lifecycle ────────────────────────────────────────────────────────

# Builds if needed (cached — fast when nothing changed), then starts everything
up:
	$(COMPOSE) up --build --remove-orphans

# Same as up but runs in the background — use 'make logs' to follow output
up-detached up-detatched:
	$(COMPOSE) up --build --remove-orphans -d

down:
	$(COMPOSE) down --remove-orphans

down-volumes:
	$(COMPOSE) down --remove-orphans -v

# Run after pnpm add/remove — rebuilds the image and recreates dependency volumes
reinstall:
	$(COMPOSE) down --remove-orphans
	docker volume rm $(DEV_NODE_MODULES_VOLUMES) 2>/dev/null || true
	$(COMPOSE) up --build --remove-orphans

logs:
	$(COMPOSE) logs -f api web scraper

# Open an interactive shell in the dev container
shell:
	$(COMPOSE) exec workspace sh

# Run an arbitrary command in the container: make exec CMD="pnpm --filter api build"
exec:
	$(COMPOSE) exec workspace $(CMD)

# ── Build / quality ────────────────────────────────────────────────────────────

test:
	$(COMPOSE) exec workspace pnpm test

typecheck:
	$(COMPOSE) exec workspace pnpm typecheck

lint:
	$(COMPOSE) exec workspace pnpm lint

build-app:
	$(COMPOSE) exec workspace pnpm build

# ── Database ───────────────────────────────────────────────────────────────────

db-push:
	$(COMPOSE) exec workspace pnpm db:push

db-generate:
	$(COMPOSE) exec workspace pnpm db:generate

db-migrate:
	$(COMPOSE) exec workspace pnpm db:migrate
