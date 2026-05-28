# WAV Search — AI Agent Guide

Wheelchair Accessible Vehicle (WAV) search aggregator. Ingests listings from multiple sources,
normalizes data, and presents an analytics-first filter dashboard. Mobile-first, API-first.

**Built with AI assistance. AI-agnostic documentation — any capable AI agent can work here.**

---

## Product vision

WAVSearch is not a keyword search engine. It is a **progressive narrowing** experience: the user
starts with the full inventory and filters it down to exactly the vehicles that match their needs.

### How it works

Every filter is backed by a chart. Every chart reflects the currently filtered inventory. When the
user adjusts a filter, all charts and filter controls update together.

**Example interactions:**

- **Price histogram + dual-handle slider** — the chart shows how prices distribute across all
  visible listings. Drag the handles to set a low and high bound; only listings in that range
  remain, and all other filters update to match.
- **Color pie chart** — shows the share of each color in the filtered set. Tap a slice to include
  or exclude that color; everything else reacts.
- **Make, year, mileage, conversion type, ramp type** — the same pattern repeats for every
  WAV-specific attribute.

The user iterates — pick, adjust, narrow — until the page shows only the inventory that fits.

### Bookmarkable results

When the user has filtered to their preferences, the URL encodes the full filter state. They can:

- Bookmark the URL and return later.
- Share the link with a caregiver, dealer, or friend.
- Return to find **newer listings first**, with a "New since you were last here" indicator that
  highlights inventory added after their last visit.
- No sign-up required to search or bookmark.

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

### Option A — Docker dev (recommended, no local Node/pnpm required)

All building and hot reload runs inside a container. Your source files stay on your machine and are bind-mounted in. Only Docker is required on the host.

```bash
make up         # start everything (builds on first run, rebuilds if anything changed)
make db-push    # push DB schema (once, or after schema changes)
make down       # stop everything
```

| Service     | URL                   |
| ----------- | --------------------- |
| Web app     | http://localhost:3000 |
| API         | http://localhost:3001 |
| Meilisearch | http://localhost:7700 |

To enable the AI scraper, export `ANTHROPIC_API_KEY` in your shell before `make up` — it is forwarded into the container automatically.

**Hot reload:** file changes on your machine are picked up immediately. If edits stop being detected, uncomment `WATCHPACK_POLLING: "true"` in `docker-compose.dev.yml`.

## Running commands (IMPORTANT for agents)

**All build, test, and database commands must run inside the dev container, not on the host.**
The `Makefile` provides short targets that forward each command automatically:

| Instead of…          | Run…              |
| -------------------- | ----------------- |
| `pnpm test`          | `make test`       |
| `pnpm typecheck`     | `make typecheck`  |
| `pnpm lint`          | `make lint`       |
| `pnpm build`         | `make build-app`  |
| `pnpm db:push`       | `make db-push`    |
| `pnpm db:generate`   | `make db-generate`|
| `pnpm db:migrate`    | `make db-migrate` |

For anything not covered by a Make target, use:
```bash
make exec CMD="pnpm --filter @wav-search/api build"
```

Or drop into a shell: `make shell`

Running `pnpm <command>` directly on the host will use the host's Node installation (if any) and will not reflect the container's environment. Always use `make` targets.

### Option B — VS Code Dev Container

Opens the full dev environment inside VS Code (or GitHub Codespaces) with all extensions pre-installed. Requires the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

1. Open the repo in VS Code and click **"Reopen in Container"** when prompted.
2. Wait for the container build — `pnpm install`, Prisma client generation, and env file setup all run automatically.
3. Push the DB schema: `pnpm db:push`
4. Start dev servers: `pnpm dev`

### Option C — Local (manual)

**Prerequisites:** Docker, Node 24, pnpm 11

```bash
docker compose up postgres valkey meilisearch -d
pnpm install
pnpm db:generate && pnpm db:push
cp apps/api/.env.example apps/api/.env
cp apps/scraper/.env.example apps/scraper/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
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

**tsx/esbuild pitfall inside `page.evaluate`:** tsx's esbuild wraps named arrow-function-to-const assignments (e.g. `const fn = (x) => {}`) with `__name(fn, "fn")`, which is not defined in the Playwright browser sandbox and causes `ReferenceError: __name is not defined` at runtime. Use `function` declarations instead, and inline any repeated logic rather than defining named helpers.

---

## API routes

| Method | Path                      | Description                                          |
| ------ | ------------------------- | ---------------------------------------------------- |
| GET    | /health                   | Health check                                         |
| GET    | /v1/listings              | Search listings with filters + aggregations          |
| GET    | /v1/listings/facets       | Facet aggregations for dashboard charts (cached 60s) |
| GET    | /v1/listings/:id          | Single listing detail                                |
| GET    | /v1/listings/:id/price-history | Listing price history                           |
| GET    | /v1/sources               | List configured scraper sources                      |

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
- **PRs:** SDLC metadata gate checks linked issue, review checklist, accessibility checklist, QA notes, and release notes
- **Main branch only:** build + push Docker images to GitHub Container Registry (ghcr.io) via `.github/workflows/publish.yml`

SDLC automation:

- `docs/SDLC.md` defines the issue to agent to code review to accessibility review to QA to publish flow.
- `docs/BRAND.md` defines designer-owned UI and brand rules that web changes must follow.
- `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` provide GitHub Copilot/code-review guidance.
- `.github/workflows/agent-intake.yml` selects assigned work first, then ready unassigned work, and checks in on the selected issue.
- `packages/agents` is provider-agnostic. Use `AGENTS_PROVIDER=anthropic|openai|copilot|ollama`.

Images tagged with commit SHA and `latest`.

---

## Environment variables

See `.env.example` in each app directory. Never commit `.env` files.

Required secrets for CI: none beyond `GITHUB_TOKEN` (auto-provided) for image pushes.
Required for scraper: `ANTHROPIC_API_KEY`.

Agent provider secrets:

- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Copilot/GitHub Models: `AGENTS_COPILOT_TOKEN` or `GITHUB_TOKEN`
- Ollama: local `AGENTS_OLLAMA_BASE_URL`

---

## Testing

- **Unit:** Vitest (`make test`) — no network, no DB. Fast.
- **Integration:** Vitest (`make exec CMD="pnpm test:integration"`) — hits real services. Excluded from default run.
- **E2E:** Playwright (future, `apps/web/e2e/`)

Test files live next to their source files: `foo.ts` → `foo.test.ts`. Integration tests use the `*.integration.test.ts` suffix.

---

## Development workflow

**Every session that changes files must follow this flow, without exception.**

### 1. Start of session — pick an issue

Run `gh issue list --state open` and suggest the most relevant unassigned open issue for the
stated work. Present the suggestion and wait for user confirmation before branching. If the user
specifies an issue number directly, use that one.

Once an issue is confirmed, add `status:in-progress` and post a brief check-in comment:

```bash
gh issue edit {N} --add-label "status:in-progress"
gh issue comment {N} --body "Picking this up — [one sentence on your first step]."
```

### 2. Create a branch

Always pull main first so you branch off the latest code:

```bash
git checkout main && git pull origin main
git checkout -b feat/issue-{N}-{short-slug}
# e.g. feat/issue-42-filter-sidebar
# use fix/ for bugs, docs/ for docs — see branch naming table in step 6
```

`N` is the GitHub issue number. Short slug is 2–3 words, kebab-case, describing the work.
Never work directly on `main`.

### 3. Do the work

**Commit small and often.** Don't save everything for the end. Every time a coherent piece of work is complete and the build isn't broken — a new function, a passing test, a wired-up route — commit it. Small commits are easier to review, easier to revert, and make progress visible.

The bar for committing: typecheck and lint pass, tests pass, nothing that was working before is now broken. A feature doesn't have to be fully complete — it just can't break the build.

Keep commits atomic — one logical change per commit. Reference the issue in every commit message: `refs #N` or `fixes #N`.
Never commit `.env` files or other secrets.

If the work touches `apps/web`, read `docs/BRAND.md` before writing any UI code.

### 4. Tests must pass before every commit

```bash
make typecheck   # type check — must pass for any changed packages
make lint        # lint — must pass
make test        # unit tests — must pass
```

Never commit with failing tests, lint errors, or type errors. Fix them first.

### 5. Commit, push, open a draft PR

After tests pass:

Use `refs #N` in the commit message when the PR is partial work; use `fixes #N` when the PR fully completes the issue — GitHub auto-closes the issue on merge when `fixes` is used.

```bash
git add <specific files>   # never use git add -A blindly — stage only relevant files
git commit -m "type(scope): description (refs #N)"

# Rebase onto latest main before pushing — keeps history clean and avoids surprise conflicts at merge time
git fetch origin
git rebase origin/main

git push -u origin HEAD
gh pr create --draft       # PR body must mention the issue number

# Clean up local branch — it's safe on the remote, no reason to keep a local copy
git checkout main
git branch -d feat/issue-{N}-{short-slug}  # use -D if git refuses
```

The session-end hook (`scripts/session-end.sh`) runs automatically when the session ends
and will push and open a draft PR if you haven't done so yet.

### 6. Merge the PR

Once the draft PR is open:

1. Run `/code-review` on the PR and address any findings
2. Verify both checks are green: `gh pr checks {PR#}` — wait for `ci` and `gates`
3. Check the `- [x] CI passes` and `- [x] Code review findings are resolved or tracked` boxes in the PR body
4. Add `status:needs-review` label: `gh pr edit {PR#} --add-label "status:needs-review"`
5. Mark ready for review: `gh pr ready {PR#}`
6. Merge: `gh pr merge {PR#} --rebase --delete-branch`
7. Update local main: `git pull origin main && pnpm install`
8. If the PR touched the Prisma schema, also run `pnpm db:generate`

If main advanced while you were working and the rebase in step 5 was skipped, rebase before merging: `git fetch origin && git rebase origin/main`, re-run checks, then push with `git push --force-with-lease`.

### Accessibility checklist rules

The SDLC gate enforces the accessibility checklist on non-draft PRs:

- Check `- [x] Not user-facing` if the PR has no UI changes — this satisfies the gate and skips the other a11y items.
- If the PR touches `apps/web` or any UI, leave "Not user-facing" unchecked and complete all four items (keyboard, screen reader, color contrast, mobile viewport). The gate will fail if any are missing.

### Branch naming

| Issue type | Prefix |
|---|---|
| Feature | `feat/issue-{N}-{slug}` |
| Bug fix | `fix/issue-{N}-{slug}` |
| Docs / process | `docs/issue-{N}-{slug}` |

---

## Potential SaaS spinouts (notes for future discussion)

- **Self-healing scraper engine** (`apps/scraper/src/engine/`) — the AI-powered structure detection + remapping is independently useful. Keep the interface boundary clean.
- **Analytics filter component** — the histogram + dual-slider filter pattern may be extractable as a standalone React component/library.
