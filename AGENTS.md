# WivWav — Agent Guide

WivWav is a wheelchair accessible vehicle (WAV) listing aggregator. It scrapes listings from multiple sources, normalizes data, and presents an analytics-first filter dashboard — mobile-first, API-first.

**AI-agnostic. Any capable agent can work here.**

---

## Architecture

See `.claude/core.md` for the monorepo structure, infrastructure overview, and key principles.

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
6. Validate, commit, push, and open a draft PR — see **Explicit workflow** below for the shell steps. Claude Code: `/wivwav-finish-issue`.
7. Review the PR, address findings, and merge with **rebase** (`gh pr merge --rebase`). Claude Code: `/code-review`.

Never work directly on `main`. Never commit on failing tests.
Never leave an issue without a commit and draft PR — finish explicitly, not at session end.

### Definition of Done

An issue is not done until the implementation evidence is easy for another human or agent to audit:

- Every acceptance criterion from the issue is mapped to a proof line in the PR, using a command result, test, screenshot, log line, or explicit "not applicable" note.
- Required validation has run: typecheck, lint, relevant tests, and any manual checks named by the issue or touched area.
- User-facing changes include accessibility evidence for keyboard use, screen reader semantics, contrast, mobile layout, and visual-only alternatives where relevant.
- Deployment-impacting changes include release notes, rollback notes, and post-release smoke checks.
- Known gaps, skipped tests, or follow-up work are called out in the PR rather than hidden in the conversation.

Keep evidence concise. Link to logs, screenshots, or issue comments when details are long instead of pasting large output into the PR.

### Human handoffs

Agents must guide the human at SDLC decision points. If work is complete, blocked, ambiguous, ready for validation, ready for review, or waiting on product/technical judgment, end with 2–4 concrete next-step options, with one marked **Recommended** when there is a clear safest next step.

Keep the wording natural: state the current state, offer practical choices, recommend the safest next move, and name the command when one exists. Humans should not need to remember project slash commands or workflow order.

### Session start course correction

When a human starts an implementation request without an issue, branch, or stated intention to discuss only, agents should briefly course-correct before editing code:

- For implementation work, recommend the issue workflow: pick or confirm an issue, label it `status:in-progress`, branch from `main`, then start.
- For discussion, debugging, review, or planning, do not force the issue workflow; suggest opening an issue only when the discussion turns into implementation work.
- If the current branch is `main` and code changes are requested, stop and offer to create or select an issue and branch first.

If the PR touches `apps/web`, read `docs/BRAND.md` before writing any UI code.

### Agent token budget

Keep always-loaded agent context short and stable. `AGENTS.md` is the canonical source of truth, but agents should not repeatedly read the whole file when `.claude/core.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, or a scoped rule already has the needed detail.

Provider-specific guidance:

- **Claude / Claude Code:** use `CLAUDE.md` and `.claude/core.md` for startup context; use role files, skills, and subagents for task-specific detail. Keep returned subagent summaries concise.
- **Codex / OpenAI:** `AGENTS.md` is canonical. Read the **Explicit workflow** section for the shell commands that replace Claude Code's `wav-*` skills — start, review, and finish steps are all there. Preserve stable prompt prefixes and append per-issue context after reusable instructions so OpenAI prompt caching can hit.
- **Gemini:** use `GEMINI.md` for concise project context. Read `AGENTS.md` only when the task needs full workflow or architecture reference.
- **GitHub Copilot / Cursor:** use their repo instruction/rule files for concise defaults; read domain docs only when the touched files require them.
- **Ollama/local models:** optimize by reducing prompt size and using deterministic commands (`rg`, tests, typecheck, lint) instead of asking the model to rediscover repo state.

For every implementation task, search first, plan the likely files, then read the smallest useful file ranges. Do not open generated output, build artifacts, or broad directory trees unless needed to diagnose the issue.

The cross-agent optimization plan is tracked in `docs/design/agent-token-optimization.md`.

### Worker flow (sprint)

When a worker agent is spawned by `/wivwav-run-sprint`, it follows this sequence:

```
1. Branch from latest main
        git fetch origin main && git checkout -b {branch} origin/main

2. Fetch issue details
        gh issue view N --json number,title,body,labels

3. Plan  — before touching any file, write a brief plan:
        which files to create or modify, what types are needed, risks to watch for

4. Implement  — write the code following AGENTS.md conventions

5. /wivwav-review-pipeline N  — four sub-agents review the actual changed files:
        reviewer      bugs, type safety, security, principles
        accessibility WCAG 2.1 AA (only if apps/web/ files changed)
        tester        missing Vitest coverage → writes tests to disk
        qa            validates against the issue acceptance criteria

6. Fix and re-review  — up to 2 cycles if REVISION NEEDED

7. /wivwav-finish-issue N  — typecheck + lint + test → commit → push → draft PR
```

Spawned workers should receive the issue number and execution metadata, not the full issue body. Fetching the issue body inside the worker keeps spawn prompts smaller across Claude, Codex, Gemini, Copilot/Cursor, and local-agent implementations.

The `/wivwav-review-pipeline` and `/wivwav-finish-issue` skills are in `.claude/skills/`.
The review role prompts live in `packages/agents/src/roles.ts` and are read at runtime by the sub-agents.

---

### Explicit workflow (Codex and other agents)

Agents that cannot invoke `.claude/skills/wivwav-*` commands follow the same SDLC stages using shell commands. These are the direct equivalents of `wivwav-start-issue`, `wivwav-review-pipeline`, and `wivwav-finish-issue`.

#### Start an issue

```bash
# 1. Look up the issue
gh issue view N --json number,title,body,labels

# 2. Verify before starting — stop and report if any check fails:
#    - Issue is open and not already labeled status:in-progress
#    - Body contains acceptance criteria: look for "acceptance criteria",
#      "done when", or a - [ ] checklist. No AC = do not start.

# 3. Label, branch, and post check-in
gh issue edit N --add-label status:in-progress --remove-label status:ready
git checkout main && git pull origin main
git checkout -b {prefix}/issue-N-{slug}
gh issue comment N --body "Starting work on issue #N. Branch: {branch-name}"
```

Prefix rules — `feat/`, `fix/`, `docs/`, `chore/` — follow **Commit format and branch naming**.

#### Review changed files

```bash
# See what changed
git diff origin/main --name-only

# Run validation — stop and fix before continuing if any fails
pnpm typecheck && pnpm lint && pnpm test
```

For each changed file, read it and run `git diff origin/main -- {file}`. Check for:

- **Type safety** — null checks, incorrect type assumptions, unsafe casts
- **Security** — input validation at system boundaries, injection risks, exposed secrets
- **Logic bugs** — missed edge cases, wrong conditionals, off-by-one errors
- **Acceptance criteria** — every AC item in the issue must be provably implemented
- **If `apps/web/` changed** — WCAG 2.1 AA: keyboard, ARIA correctness, contrast, mobile touch targets
- **If `apps/api/src/routes/` changed** — verify the routes table in this file is current
- **If `apps/scraper/` changed** — avoid arrow functions inside `page.evaluate()` (tsx esbuild pitfall)

Label findings [CRITICAL], [WARNING], or [SUGGESTION]. Fix all [CRITICAL] and [WARNING] before finishing. Write missing Vitest tests to disk for any changed logic that lacks coverage.

#### Finish an issue

```bash
# 1. Final validation — do not proceed if any command fails
pnpm typecheck && pnpm lint && pnpm test

# 2. Stage only files relevant to this issue (never .env, caches, or unrelated changes)
git status --short
git add {relevant files}

# 3. Commit with the required format
#    Use "fixes #N" instead of "refs #N" when this commit fully resolves the issue.
#    Co-Authored-By: use your platform's value from the Attribution table in .claude/core.md
git commit -m "type(scope): description (refs #N)" \
  --trailer "Agent-Role: worker" \
  --trailer "Co-Authored-By: Codex GPT-4o <noreply@openai.com>"

# 4. Push and open a draft PR
git push -u origin {branch}
gh pr create --draft \
  --title "type(scope): description" \
  --body "$(cat <<'EOF'
## Summary
{what changed and why}

## Acceptance Evidence
{one line per AC item — command output, test name, log line, or explicit gap note}

## Risk level
- [x] Low / [ ] Medium / [ ] High

## QA Notes
{what a human reviewer should manually verify before approving}
EOF
)"
```

Tell the user: "Draft PR is open. Run `/code-review` (Claude Code) or manually review the diff before marking ready for merge."

---

### Worktree port isolation

Unit tests use `app.inject()` and do not bind ports — concurrent workers running tests never conflict. The conflict is only if a worker starts a **dev server**.

Ports are assigned by **agent index**: `base + (AGENT_INDEX * 10)`

| Agent | Who          | API ports  | Web ports  |
| ----- | ------------ | ---------- | ---------- |
| 0     | Human/local  | 3000–3009  | 4000–4009  |
| 1     | First worker | 3010–3019  | 4010–4019  |
| 2     | Second       | 3020–3029  | 4020–4029  |
| 3     | Third        | 3030–3039  | 4030–4039  |

The existing default ports (API=3003, web=3000) fall naturally in the human range.

```bash
# Get the port for this agent's dev server
bash scripts/worktree-port.sh api 1   # → 3010  (agent 1 API)
bash scripts/worktree-port.sh web 2   # → 4020  (agent 2 web)
bash scripts/worktree-port.sh api     # → 3000  (human, no index)
```

Workers receive their `AGENT_INDEX` from the orchestrator via the spawn prompt.
If you need more than 10 ports per agent, change `STEP=10` to `STEP=100` in `scripts/worktree-port.sh` — ranges expand to 100-199, 200-299, etc.

---

## Commit format and branch naming

See `.claude/core.md` for commit format, branch prefixes, and attribution trailers.

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
| GET    | /v1/vin/:vin/safety            | Decode a VIN and return NHTSA safety summary when data is available |
| GET    | /v1/market/pricing                     | Price stats (percentiles, days listed, drop rate) for a make/model spec |
| GET    | /v1/market/popular                     | Top 10 makes, models, and conversion brands by active listing count |
| GET    | /v1/vehicles/:make/:model/stats            | Lifespan and reliability stats; returns `methodology` string and `sources: [{name, url}]` array (empty array when no source is recorded); optional `?year` falls back to aggregate row when no year-specific record exists |
| GET    | /v1/vehicles/:make/:model/:year/recalls    | Open recalls for a vehicle           |
| GET    | /v1/vehicles/:make/:model/:year/complaints | Complaints for a vehicle             |
| GET    | /v1/vehicles/:make/:model/:year/research   | Latest cited model facts (EPA fuel economy, engine, drivetrain) with source URLs |
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
| GET    | /admin/ai/status               | Scraper AI provider health (Ollama by default) + installed models + sources needing remap |
| GET    | /admin/config                  | List all current config values (latest row per key). Secrets return hint only. |
| GET    | /admin/config/:key             | Get current value for one key (404 if tombstoned) |
| PUT    | /admin/config/:key             | Insert a new config row (append-only). Secrets: encrypts + returns hint. |
| GET    | /admin/config/:key/history     | All historical rows for a key (newest first) |
| GET    | /admin/config/:key/decrypt     | Decrypted plaintext for a secret key (server-to-server only — requires `Authorization: Bearer {INTERNAL_API_SECRET}` in production) |
| DELETE | /admin/config/:key             | Soft-delete: inserts a tombstone row (value: null) |
| GET    | /admin/board                   | Queue job inspector UI               |

Most responses use `{ data: T }` for success and `{ error: { code, message } }` for errors. Exceptions: `GET /v1/listings` returns `{ data, facets, pagination }`; `GET /v1/sources` returns `{ sources: [] }`.

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
| vehicle-stats-refresh | Weekly Sun 1 AM  | Re-seeds lifespan/reliability stats from static JSON |

---

## Data model

See `packages/types/src/listing.ts` for the complete `Listing` interface.

The `GET /v1/listings/:id` response groups listing fields into three nested objects:
- `wav` — `conversionType`, `conversionManufacturer`, `floorLoweringInches`, `rampType`, `hasLift`, `handControls`, `transferSeat`, `wheelchairCapacity`
- `location` — `zip`, `city`, `state`, `lat`, `lng`
- `dealer` — `name`, `phone`, `website`

### Naming conventions

- **Table names:** singular snake_case — `listing_price_history`, `vehicle_stats`
- **Column names:** camelCase in Prisma model fields; column names in the DB match the field name exactly (camelCase) unless an explicit `@map` decorator is added
- **Enums:** singular PascalCase — `SourceStatus`, `ConversionType`

> Many existing tables use plural names (`sources`, `listings`, `scraper_runs`, `raw_pages`, `vehicle_models`, `recalls`, `complaints`, `safety_ratings`, `conversion_brands`, `conversion_products`, `nmea_dealers`). Do not rename them. All new tables must use singular names.

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

If `checkStructure()` detects a change, the engine marks the source `needs_remapping` and calls the configured AI provider to derive new CSS selectors (default: Ollama; set `ai.scraper.structure.provider` in the config DB to switch). Sources run on independent cron schedules.

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

- CI: only `GITHUB_TOKEN` (auto-provided)

AI API keys and provider selection are managed through the config DB, not env vars. Set them via `/ops/ai` or the `/admin/config` API:

| Config key | Description |
| --- | --- |
| `secret.anthropic.default` | Anthropic API key (type: secret, encrypted at rest) |
| `ai.<job>.provider` | `anthropic` or `ollama` — which provider a job uses |
| `ai.<job>.model` | Model name for that provider |
| `ai.<job>.apiKeyId` | Points to the secret config key holding the API key |

Where `<job>` is one of: `intake`, `scraper.structure`, `scraper.remap`, `agents`.
