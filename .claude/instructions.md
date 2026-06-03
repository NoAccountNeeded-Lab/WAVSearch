# Claude Code Instructions for WAVSearch

**Start here:** Read `.claude/core.md`, then your role file in `.claude/roles/`. Read `AGENTS.md` only when you need deep reference (data model, API routes, ops, scraper architecture).

---

## Choose Your Path

### Web Frontend (`apps/web`)

Before any UI code: read `docs/BRAND.md` for product principles and color system.

```bash
make dev
open http://localhost:3000
```

Key patterns:
- Server components by default; `'use client'` at the interactivity boundary
- State via URL search params + React hooks (no Redux/Zustand)
- CSS Modules + semantic color tokens (no Tailwind)
- WCAG 2.1 AA mandatory — keyboard, screen reader, visible focus, no color-only indicators

### API (`apps/api`)

```bash
make dev
# API: http://localhost:3003   Swagger: http://localhost:3003/documentation
```

Key patterns:
- Fastify + Route → Service → Repository
- Strict TypeScript, `.js` extensions on local imports
- Meilisearch for search · Valkey for cache · PostgreSQL via Prisma
- **If you add/remove/rename a route:** update the routes table in `AGENTS.md` before committing — a PreToolUse hook enforces this

### Scraper (`apps/scraper`)

```bash
make dev
# Integration test: pnpm exec tsx apps/scraper/src/sources/blvd.integration.test.ts
```

Key patterns:
- Playwright + Claude AI for self-healing selectors (confidence ≥ 0.7 required)
- `SourceAdapter` interface: `checkStructure()` + `scrape()`
- **Pitfall:** Inside `page.evaluate()`, use `function` declarations, not arrow functions

---

## Before Committing

Hard rule: never commit if `pnpm test`, `pnpm typecheck`, or `pnpm lint` fails.

Use `/finish-issue` to validate, commit, push, and open a draft PR. Never rely on session end.

A `PreToolUse` hook runs `scripts/check-docs.sh` before every `git commit`. It blocks commits that touch `apps/api/src/routes/` without also staging `AGENTS.md`.

---

## Review Priorities

1. Correctness bugs and regressions
2. Security and data exposure
3. Accessibility failures (web changes must be WCAG 2.1 AA)
4. API/data contract drift
5. Missing tests for changed behavior

---

## Type System & Imports

- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
- ESM local imports use `.js` extensions: `import { foo } from './foo.js'`
- Explicitly mark `import type { Foo } from '...'`
- No `any` — use discriminated unions for error handling

---

## Troubleshooting

**Hot reload not working?** Ensure `make dev` is running all services. Check port conflicts.

**Database schema out of sync?** Run `pnpm db:push`. Destructive changes: `pnpm db:reset` (dev only).

**Scraper structure detection failing?** Check if site HTML changed. Ensure `ANTHROPIC_API_KEY` is set for Claude remapping, or use Ollama.

**Tests failing?**
- Unit: `make test` (fast, no network)
- Integration: `pnpm exec tsx apps/scraper/src/sources/blvd.integration.test.ts`
- Types: `make typecheck`

---

## Resources

- Core agent context: `.claude/core.md`
- Role files: `.claude/roles/`
- Full project reference: `AGENTS.md`
- UI standards: `docs/BRAND.md`
