# WAVSearch Gemini Context

WAVSearch is a pnpm/Turborepo TypeScript monorepo for wheelchair accessible vehicle listings.

Use `AGENTS.md` as the canonical project guide, but read it only when the task requires deep workflow, route, data model, scraper, or ops reference. For quick orientation, use these facts:

- Apps: `apps/api` Fastify REST API, `apps/web` Next.js App Router, `apps/scraper` Playwright scraper.
- Packages: `packages/types`, `packages/db`, `packages/config`, `packages/queue`, `packages/agents`.
- Use strict TypeScript, ESM `.js` local imports, mobile-first UI, and WCAG 2.1 AA for user-facing output.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before committing.
- Never work directly on `main`; use the issue branch workflow in `AGENTS.md`.

Keep context use deliberate. Search first with `rg`, read narrow file ranges, and avoid loading generated files, build output, or broad directory trees.
