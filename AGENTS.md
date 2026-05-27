# WAV Search — AI Agent Guide

Wheelchair Accessible Vehicle (WAV) search aggregator. Ingests listings from multiple sources,
normalizes data, and presents an analytics-first filter dashboard. Mobile-first, API-first.

**Built with AI assistance. AI-agnostic documentation — any capable AI agent can work here.**

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

```bash
# Start infrastructure
docker compose up postgres valkey meilisearch -d

# Install deps
pnpm install

# Generate Prisma client + push schema
pnpm db:generate && pnpm db:push

# Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/scraper/.env.example apps/scraper/.env
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env

# Run all services in dev mode
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

| Method | Path             | Description                                 |
| ------ | ---------------- | ------------------------------------------- |
| GET    | /health          | Health check                                |
| GET    | /v1/listings     | Search listings with filters + aggregations |
| GET    | /v1/listings/:id | Single listing detail                       |
| GET    | /v1/sources      | List configured scraper sources             |

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

- **Unit:** Vitest (`pnpm test`) — no network, no DB. Fast.
- **Integration:** Vitest (`pnpm test:integration`) — hits real services (Playwright, DB). Excluded from default run.
- **E2E:** Playwright (future, `apps/web/e2e/`)

Test files live next to their source files: `foo.ts` → `foo.test.ts`. Integration tests use the `*.integration.test.ts` suffix.

---

## Development workflow

**Every session that changes files must follow this flow, without exception.**

### 1. Start of session — pick an issue

Run `gh issue list --state open` and suggest the most relevant unassigned open issue for the
stated work. Present the suggestion and wait for user confirmation before branching. If the user
specifies an issue number directly, use that one.

### 2. Create a branch

```bash
git checkout -b feat/issue-{N}-{short-slug}
# e.g. feat/issue-42-filter-sidebar
# use fix/ for bugs, docs/ for docs — see branch naming table in step 6
```

`N` is the GitHub issue number. Short slug is 2–3 words, kebab-case, describing the work.
Never work directly on `main`.

### 3. Do the work

Keep commits atomic. Reference the issue in every commit message: `refs #N` or `fixes #N`.
Never commit `.env` files or other secrets.

### 4. Tests must pass before every commit

```bash
pnpm typecheck            # type check — must pass for any changed packages
pnpm lint                 # lint — must pass
pnpm test                 # unit tests — must pass
```

Never commit with failing tests, lint errors, or type errors. Fix them first.

### 5. Commit, push, open a draft PR

After tests pass:

Use `refs #N` in the commit message when the PR is partial work; use `fixes #N` when the PR fully completes the issue — GitHub auto-closes the issue on merge when `fixes` is used.

```bash
git add <specific files>   # never use git add -A blindly — stage only relevant files
git commit -m "type(scope): description (refs #N)"
git push -u origin HEAD
gh pr create --draft       # PR body must mention the issue number

# Clean up local branch — it's safe on the remote, no reason to keep a local copy
git checkout main
git branch -d feat/issue-{N}-{short-slug}
```

The session-end hook (`scripts/session-end.sh`) runs automatically when the session ends
and will push and open a draft PR if you haven't done so yet.

### 6. Merge the PR

Once CI passes on the draft PR:

1. Verify both checks are green: `gh pr checks {PR#}` — wait for `ci` and `gates`
2. Check the `- [ ] CI passes` box in the PR body
3. Mark ready for review: `gh pr ready {PR#}`
4. Merge: `gh pr merge {PR#} --squash --delete-branch`
5. Update local main: `git pull origin main && pnpm install`
6. If the PR touched the Prisma schema, also run `pnpm db:generate`

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
