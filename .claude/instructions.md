# Claude Code Instructions for WAVSearch

**Start here:** Read [AGENTS.md](../AGENTS.md) — it's the canonical project guide for architecture, workflow, commit format, and testing.

This file complements AGENTS.md with Claude Code-specific guidance. It links to role-based instructions and automation hooks.

---

## Quick Orientation

**Project:** WAVSearch — wheelchair accessible vehicle listing aggregator (TypeScript monorepo)

**Key files:**
- Architecture & workflow: [AGENTS.md](../AGENTS.md)
- UI/brand standards: [docs/BRAND.md](../docs/BRAND.md)
- Repo rules: [.github/copilot-instructions.md](../.github/copilot-instructions.md)
- Focused guides: [.github/instructions/](../.github/instructions/)

---

## Start Working: Choose Your Path

### Web Frontend (`apps/web`)

**Before any UI code:**
1. Read [docs/BRAND.md](../docs/BRAND.md) for product principles and color system
2. Check [.github/instructions/brand.instructions.md](../.github/instructions/brand.instructions.md)
3. Check [.github/instructions/web-accessibility.instructions.md](../.github/instructions/web-accessibility.instructions.md)

**Quick start:**
```bash
make dev          # Start all services
open http://localhost:3000
# Web watches for changes; hot reload enabled
```

**Key patterns:**
- Server components by default; `'use client'` at interactivity boundary
- State via URL search params + React hooks (no Redux/Zustand)
- CSS Modules + semantic color tokens (no Tailwind)
- Accessibility: WCAG 2.1 AA mandatory (keyboard, screen reader, focus visible, no color-only indicators)

### API (`apps/api`)

**Quick start:**
```bash
make dev
# API listens on http://localhost:3001
# Swagger docs: http://localhost:3001/documentation
```

**Key patterns:**
- Fastify REST API (TypeScript, Node 24)
- Route → Service → Repository pattern
- Strict TypeScript with `.js` extensions on local imports
- Meilisearch for search; Valkey for cache; PostgreSQL via Prisma

**API routes:** See [AGENTS.md § API routes](../AGENTS.md#api-routes)

### Scraper (`apps/scraper`)

**Quick start:**
```bash
make dev
# Or for live integration tests:
pnpm exec tsx apps/scraper/src/sources/blvd.integration.test.ts
```

**Key patterns:**
- Playwright browser automation + Claude AI for self-healing
- `SourceAdapter` interface: `checkStructure()` + `scrape()`
- If site HTML changes, Claude derives new CSS selectors (confidence ≥ 0.7 required)
- **Pitfall:** Inside `page.evaluate()`, use `function` declarations, not arrow functions (esbuild wrapping breaks in sandbox)

---

## Before Committing

**Hard rule:** Never commit if `pnpm test` or `pnpm typecheck` fails.

Before committing, run the pre-commit check:
```bash
bash scripts/pre-commit-check.sh
```

This runs:
1. `pnpm typecheck` — TypeScript type checking
2. `pnpm test` — Unit tests

Fix any failures before attempting to commit. This rule is critical — test failures caught locally are far cheaper than caught in CI.

---

## Development Commands

From repository root (see full list in [AGENTS.md § Quick start](../AGENTS.md#quick-start)):

```bash
pnpm install        # Install dependencies
pnpm db:generate    # Generate Prisma client
pnpm db:push        # Sync schema to database

make up             # Start Docker services (Postgres, Meilisearch, Valkey)
make down           # Stop Docker services
make dev            # Start all apps with hot reload

make test           # Unit tests
make typecheck      # TypeScript check
make lint           # ESLint all packages
```

---

## Workflow: Issue → Branch → PR → Merge

1. Pick an open issue: `gh issue list --state open`
2. Add `status:in-progress` label, post check-in comment
3. Branch from main: `git checkout main && git pull origin main && git checkout -b <prefix>/issue-{N}-{slug}`
4. **Do the work** — commit small; once typecheck + lint + tests pass
5. Push and open a **draft PR** linking the issue
6. Run `/code-review`, address findings
7. Merge when CI passes + review passes

**Never work directly on `main`. Never commit on failing tests.**

---

## Commit Format

```
type(scope): description (refs #N)
```

**Common types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

Use `fixes #N` when the commit fully completes an issue (GitHub auto-closes on merge).

**Branch naming by issue type:**
- Feature: `feat/issue-{N}-{slug}`
- Bug: `fix/issue-{N}-{slug}`
- Docs: `docs/issue-{N}-{slug}`

See [AGENTS.md § Commit format](../AGENTS.md#commit-format) for details.

---

## Review Priorities

When reviewing or asking for feedback:

1. **Correctness bugs and regressions**
2. **Security and data exposure**
3. **Accessibility failures** (web changes must be WCAG 2.1 AA)
4. **API/data contract drift**
5. **Missing tests for changed behavior**

See [.github/copilot-instructions.md](../.github/copilot-instructions.md) for full context.

---

## Type System & Imports

- **Strict TypeScript:** `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- **ESM imports:** Use `.js` extensions on local package imports, e.g., `import { foo } from '@wav-search/db/dist/index.js'`
- **Type imports:** Explicitly mark `import type { Foo } from '...'`
- **No `any`:** Discriminated unions preferred for error handling

---

## Data Model

**Listing** fields (source of truth: `packages/types/src/listing.ts`):

Core: `id`, `sourceId`, `externalId`, `sourceUrl`, `title`, `price`, `mileage`, `year`, `make`, `model`, `VIN`, `condition`, `listedAt`

WAV-specific: `conversionType`, `conversionManufacturer`, `floorLoweringInches`, `rampType`, `hasLift`, `handControls`, `transferSeat`, `wheelchairCapacity`

Location: `state`, `city`, `zip`, `lat`, `lon`

See [AGENTS.md § Data model](../AGENTS.md#data-model) for details.

---

## Environment & Infrastructure

**Local stack (Docker Compose):**
- PostgreSQL 17 (dev: `wav:password`)
- Meilisearch 1.12 (search + faceting)
- Valkey 8 (Redis-compatible cache)
- Optional Ollama (local LLM for scraper self-healing)

**Environment files:** Copy `.env.example` to `.env` in each app. Never commit `.env` files.

See [AGENTS.md § Environment variables](../AGENTS.md#environment-variables) for all vars.

---

## Troubleshooting

**Hot reload not working?**
- Ensure `make dev` is running all services
- Check port conflicts (API: 3001, web: 3000, Meilisearch: 7700)

**Database schema out of sync?**
- Run `pnpm db:push` to apply pending migrations
- For destructive changes: `pnpm db:reset` (dev only)

**Scraper structure detection failing?**
- Check if the website's HTML changed (run `/code-review` to diagnose)
- Ensure `ANTHROPIC_API_KEY` is set for Claude AI remapping (or use Ollama)

**Tests failing?**
- Unit tests: `make test` (fast, no network)
- Integration tests: `pnpm exec tsx apps/scraper/src/sources/blvd.integration.test.ts` (slow, real HTTP)
- Type errors: `make typecheck` (strict TypeScript)

---

## Additional Resources

- **Architecture:** [AGENTS.md](../AGENTS.md)
- **UI standards:** [docs/BRAND.md](../docs/BRAND.md)
- **GitHub workflow:** [.github/instructions/sdlc.instructions.md](../.github/instructions/sdlc.instructions.md)
- **Repository rules:** [.github/copilot-instructions.md](../.github/copilot-instructions.md)
