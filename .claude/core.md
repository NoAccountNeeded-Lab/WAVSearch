# WivWav — Agent Core Context

WivWav aggregates wheelchair-accessible vehicle (WAV) listings from multiple dealer sources into a single searchable index for buyers and caregivers.

## Monorepo structure

```
apps/api       Fastify REST API, Node 24
apps/web       Next.js 15 App Router
apps/scraper   Playwright + AI scrape engine

packages/types    Shared TypeScript interfaces
packages/db       Prisma client, PostgreSQL 17
packages/config   Shared tsconfig/ESLint
packages/queue    BullMQ job queue
packages/agents   Multi-agent text pipeline (Ollama and Anthropic providers; CompletionProvider interface is AI-agnostic)
```

Infrastructure: PostgreSQL 17 · Meilisearch v1.12 (faceted search) · Valkey 8 (Redis-compatible cache)

## Principles

- Single responsibility — small files, one purpose
- Swappable dependencies behind interfaces — callers never import concrete implementations
- API-first, mobile-first
- WCAG 2.1 AA accessibility on all user-facing output
- MIT / Apache / BSD licenses only — check before adding dependencies
- API responses: `{ data: T }` for success · `{ error: { code, message } }` for errors
- ESM imports with `.js` extensions: `import { foo } from './foo.js'`
- Strict TypeScript — no `any`, no unjustified non-null assertions

## Database naming

- Table names: **singular** snake_case — `listing_price_history`, not `listing_price_histories`
- Many existing tables use plural names (`sources`, `listings`, `scraper_runs`, `raw_pages`, etc.) — do not rename them
- All new tables must follow the singular convention

## WAV-specific listing fields

`conversionType` · `rampType` · `hasLift` · `floorLoweringInches` · `handControls` · `transferSeat` · `wheelchairCapacity`

## Commit format

```
type(scope): description (refs #N)
```

Use `fixes #N` when the commit fully resolves the issue (GitHub auto-closes on merge).
Types: `feat` `fix` `chore` `docs` `refactor` `test`

Agent commits add trailers — see Attribution below.

## Branch naming

| Issue type   | Branch prefix              |
| ------------ | -------------------------- |
| Feature      | `feat/issue-N-slug`        |
| Bug fix      | `fix/issue-N-slug`         |
| Docs/process | `docs/issue-N-slug`        |
| Maintenance  | `chore/issue-N-slug`       |

Always branch from latest `main`. Never work directly on `main`.

## Key commands

```bash
pnpm typecheck        # TypeScript check all packages
pnpm lint             # ESLint all packages
pnpm test             # Unit tests (excludes *.integration.test.ts)
make typecheck        # Same via Makefile
make lint
make test
```

## Issue label states

`status:ready` → `status:in-progress` → draft PR opened → merged
Failure path: `status:in-progress` → `status:stuck`

## Attribution — all agent output

**Git trailers** on every agent commit:
```
Agent-Role: {role}
Agent-Index: {index}
Sprint-Run: {sprint-run-id}
Co-Authored-By: {model name and version} <noreply@{provider}.com>
```

Use the Co-Authored-By value for your own AI model and provider:

| Agent | Co-Authored-By |
| ----- | -------------- |
| Claude Sonnet 4.6 | `Claude Sonnet 4.6 <noreply@anthropic.com>` |
| Claude Haiku 4.5 | `Claude Haiku 4.5 <noreply@anthropic.com>` |
| Codex (GPT-4o) | `Codex GPT-4o <noreply@openai.com>` |
| Gemini 2.0 Pro | `Gemini 2.0 Pro <noreply@google.com>` |
| Ollama (local) | `Ollama {model-name} <noreply@ollama.ai>` |

**Comment header** on every agent GitHub comment, PR body, or issue update:
```
🤖 **{role}[{index}]** · `{skill}` · {YYYY-MM-DD}
```

Example: `🤖 **worker[1]** · \`run-sprint\` · 2026-06-03`

## Role files

Your role-specific instructions are in `.claude/roles/{your-role}.md`.
Read it after this file. Do not read AGENTS.md unless your task requires it — it is the human-facing comprehensive reference and is longer than you need.

## Full reference

AGENTS.md — complete project documentation for humans and deep-reference tasks.
