# Major Dependency Migration Plan

Tracking migrations intentionally excluded from PR #228. Each entry documents migration scope, breaking changes relevant to this codebase, and a rollback plan.

## Ecosystem split

| Ecosystem | Packages | Suggested PR |
|---|---|---|
| Linting & formatting | `eslint` 9→10, `@eslint/js` 9→10 | `chore/migrate-eslint-v10` |
| Database tooling | `prisma` 6→7, `@prisma/client` 6→7 | `chore/migrate-prisma-v7` |
| Search client | `meilisearch` 0.47→0.58 | `chore/migrate-meilisearch-v0.58` |
| API runtime | `@fastify/cors` 10→11 | `chore/migrate-fastify-cors-v11` |
| Web framework | `next` 15→16 | `chore/migrate-next-v16` |
| Type language | `typescript` 5→6, `@types/node` 22→25 | `chore/migrate-typescript-v6` |
| Test runner | `vitest` 3→4 | `chore/migrate-vitest-v4` |
| Validation | `zod` 3→4 | `chore/migrate-zod-v4` |

Each PR must pass `pnpm typecheck && pnpm lint && pnpm test` before merging. Keep each PR to its stated ecosystem — do not bundle unrelated patch/minor updates.

---

## 1. ESLint 9 → 10 (+ @eslint/js)

**Packages:** `eslint` 9.39.4 → 10.4.1, `@eslint/js` 9.39.4 → 10.0.1

**Affected packages:** `@wivwav/config`, root workspace

### Breaking changes relevant to this codebase

- **Legacy `.eslintrc` format removed.** The project already uses flat config (`packages/config/eslint.config.js`). No format migration needed.
- **Node.js minimum:** v20.19.0 / v22.13.0 / v24+. The project targets Node 24 — compatible.
- **New rules in `eslint:recommended`:** `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error`. Review any new lint errors introduced.
- **`context.getCwd()` and similar context methods removed** — only affects ESLint plugin authors, not consumers.
- **`next lint` removed in Next.js 16** (see section 5) — scripts that call `next lint` must be updated to call `eslint` directly. Coordinate with the Next.js PR.
- The `@next/eslint-plugin-next` plugin defaults to flat config, which is already the format in use.

### Migration steps

1. `pnpm add -D eslint@^10 @eslint/js@^10 -w`
2. Run `pnpm lint` — fix any new rule violations surfaced by the three new `eslint:recommended` rules.
3. Run `pnpm typecheck && pnpm test`.

### Rollback plan

`pnpm add -D eslint@^9 @eslint/js@^9 -w` — no schema or config format changes; rollback is a version pin.

---

## 2. Prisma 6 → 7

**Packages:** `prisma` 6.19.3 → 7.8.0, `@prisma/client` 6.19.3 → 7.8.0

**Affected packages:** `@wivwav/db`

### Breaking changes relevant to this codebase

- **ESM-only output.** Prisma 7 ships as ES modules only. The project already uses ESM (`.js` imports), but `packages/db/package.json` does not currently set `"type": "module"` — this must be added as part of the migration.
- **`prisma-client-js` generator deprecated.** The schema currently uses `provider = "prisma-client-js"`. Must change to `provider = "prisma-client"`.
- **`output` field becomes mandatory.** A custom output path must be specified in the generator block. The generated client import path must change from `@prisma/client` to the configured output path across all consumers (`packages/db/src/client.ts`, `packages/db/src/index.ts`, `packages/db/prisma/seed.ts`).
- **Driver adapters required.** All databases now need an explicit driver adapter. For PostgreSQL: install `@prisma/adapter-pg` and wire it into `PrismaClient`. This is the most significant change.
- **`prisma.config.ts` replaces inline datasource config.** `directUrl` and env variable loading move to this new file.
- **Client middleware API removed.** Use Client Extensions instead. The codebase does not appear to use `$use()` middleware — verify before upgrading.
- **Auto-seeding removed.** `prisma db seed` must be called explicitly; `--skip-seed` flag removed.
- **Removed flags:** `--skip-generate` from migration commands.
- **Node.js minimum:** 20.19.0+ — compatible.
- **TypeScript minimum:** 5.4.0+ — compatible (currently 5.9.3).

### Migration steps

1. Add `"type": "module"` to `packages/db/package.json`.
2. `pnpm add @prisma/adapter-pg -w -F @wivwav/db` (add PostgreSQL driver adapter)
3. `pnpm add -D prisma@^7 @prisma/client@^7 -F @wivwav/db`
4. Update `packages/db/prisma/schema.prisma` generator block:
   - Change `provider` to `"prisma-client"`
   - Add `output = "../generated/prisma"`
5. Create `packages/db/prisma/prisma.config.ts` and move datasource config there.
6. Update `packages/db/src/client.ts` to import from the new output path and wire the `@prisma/adapter-pg` adapter.
7. Update all other `@prisma/client` imports across `@wivwav/db` to use the new output path.
8. Run `pnpm --filter @wivwav/db generate`.
9. Run `pnpm typecheck && pnpm lint && pnpm test`.
10. Run a migration smoke test against a local database: `pnpm --filter @wivwav/db migrate:create`.

### Rollback plan

Revert `packages/db/prisma/schema.prisma` and `packages/db/src/client.ts`, then `pnpm add -D prisma@^6 @prisma/client@^6 -F @wivwav/db && pnpm exec prisma generate`.

---

## 3. meilisearch 0.47 → 0.58

**Package:** `meilisearch` 0.47.0 → 0.58.0

**Affected packages:** `@wivwav/api`, `@wivwav/search`, `apps/scraper`

### Breaking changes relevant to this codebase

- **Class renamed: `MeiliSearch` → `Meilisearch`** (capital S dropped). Affected files:
  - `apps/api/src/index.ts` — `new MeiliSearch(...)` and import
  - `apps/scraper/src/lib/meili.ts` — `new MeiliSearch(...)` and import
  - All files using `import type { MeiliSearch }` — update to `Meilisearch`
- **Error class renamed:** `MeiliSearchError` → `MeilisearchError`, `MeiliSearchTimeOutError` → `MeiliSearchRequestTimeOutError`.
- **ESM-only** (from v0.57). The project already uses ESM — compatible.
- **Import style changed** (from v0.57): `import { Meilisearch } from 'meilisearch'` (named export, lowercase).
- **`TaskClient` / `BatchClient` no longer standalone exports** (v0.51). Access via `client.tasks` and `client.batches` properties. Verify the codebase does not import these classes directly.
- **`requestConfig` constructor param renamed to `requestInit`** (v0.50).
- **`EnqueuedTask`, `Batch`, `Task` classes removed** (v0.50) — types still exported. Check usage.
- **Date properties on task/batch objects changed from objects to ISO 8601 strings** (v0.50).
- **Meilisearch v1.37 network API compatibility changes** (v0.56) — review any network-level API calls.

### Migration steps

1. `pnpm add meilisearch@^0.58 -F @wivwav/api -F @wivwav/search -F @wivwav/scraper`
2. Rename all `MeiliSearch` → `Meilisearch` in type imports and `new` calls.
3. Rename `MeiliSearchError` and `MeiliSearchTimeOutError` if used.
4. Run `pnpm typecheck` — TypeScript will surface any remaining symbol mismatches.
5. Run `pnpm test`.
6. Smoke-test search and indexing via the local dev stack.

### Rollback plan

`pnpm add meilisearch@^0.47 -F @wivwav/api -F @wivwav/search -F @wivwav/scraper`. No schema or database changes; rollback is a version pin plus reverting renames.

---

## 4. @fastify/cors 10 → 11

**Package:** `@fastify/cors` 10.1.0 → 11.2.0

**Affected packages:** `@wivwav/api`

### Breaking changes relevant to this codebase

- **Default `methods` narrowed to CORS-safelisted methods only.** Previously all HTTP verbs were allowed by default. The API serves `GET`, `POST`, `PATCH`, `DELETE`, and `PUT` routes. The current CORS registration in `apps/api/src/app.ts` must be audited to ensure `methods` is explicitly set:
  ```ts
  await fastify.register(cors, {
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    // existing origin/credentials options
  })
  ```
- **Route-level CORS** is now available (v11.2.0 addition, not a breaking change).

### Migration steps

1. `pnpm add @fastify/cors@^11 -F @wivwav/api`
2. Open `apps/api/src/app.ts` and add an explicit `methods` array/string to the CORS registration.
3. Run `pnpm typecheck && pnpm test`.
4. Integration-test CORS headers using `curl -X OPTIONS` for each HTTP method used by the API.

### Rollback plan

`pnpm add @fastify/cors@^10 -F @wivwav/api`. Config-only change; rollback is a version pin.

---

## 5. Next.js 15 → 16

**Package:** `next` 15.5.19 → 16.2.7

**Affected packages:** `@wivwav/web`

### Breaking changes relevant to this codebase

- **Async Request APIs — synchronous access fully removed.** `cookies()`, `headers()`, `draftMode()`, dynamic `params`, and `searchParams` are now async-only. The codebase already uses `await params` / `await searchParams` in all page components — this is already compliant.
- **`middleware` → `proxy` rename.** No `middleware.ts` file exists in the web app. No action needed.
- **`next lint` command removed.** If any script or CI step calls `next lint`, replace it with a direct `eslint` invocation. Coordinate with the ESLint v10 PR.
- **Turbopack is the default bundler.** `next.config.ts` has no custom webpack config — compatible. The `--turbopack` flag in dev scripts is no longer needed and can be removed.
- **`experimental.turbopack` config moved to top-level `turbopack`.** Current `next.config.ts` does not set `experimental.turbopack` — no action needed.
- **`experimental_ppr` route segment config removed.** Not used in this codebase.
- **`revalidateTag` requires a second `cacheLife` argument.** Not currently used in this codebase.
- **`unstable_cacheLife` / `unstable_cacheTag` renamed** (remove `unstable_` prefix). Not used in this codebase.
- **`serverRuntimeConfig` / `publicRuntimeConfig` removed.** Not used — current config uses `NEXT_PUBLIC_` env vars.
- **`next/legacy/image` deprecated.** Not used — all image usage already on `next/image`.
- **`images.minimumCacheTTL` default changed** 60s → 14400s. Current config does not override this; accept the new default (4 hours is more appropriate for listing images).
- **`images.imageSizes` default** no longer includes `16`. Current config does not override — accept new default.
- **`images.qualities` default now `[75]` only.** Current config does not override — accept new default.
- **Parallel route slots require explicit `default.js`.** No parallel routes found in current `apps/web/src/app/` structure — no action needed.
- **AMP support removed.** Not used.
- **Runtime configuration removed.** Not used.
- **`devIndicators` options `appIsrStatus`, `buildActivity`, `buildActivityPosition` removed.** Not set in current config.
- **`next dev` outputs to `.next/dev`** (separate from `next build`). Update any scripts or Docker health checks that reference the `.next` output directory for the dev server.
- **`images.domains` deprecated** (use `remotePatterns`). Current config already uses `remotePatterns` — compliant.

### Migration steps

1. `pnpm add next@^16 react@latest react-dom@latest @types/react@latest @types/react-dom@latest -F @wivwav/web`
2. Run the official codemod for any remaining async API migrations: `pnpm dlx @next/codemod@canary upgrade latest` in `apps/web/`.
3. Run `pnpm typegen` in `apps/web/` to regenerate `PageProps`/`LayoutProps` type helpers.
4. Remove `--turbopack` flag from any dev scripts that include it.
5. Update any CI or Docker steps that call `next lint` to call `eslint` directly.
6. Run `pnpm typecheck && pnpm lint && pnpm test`.
7. Smoke-test: `pnpm --filter @wivwav/web build` and verify the standalone output.

### Rollback plan

`pnpm add next@^15 react@^19 react-dom@^19 -F @wivwav/web`. No database or API changes; rollback is a version pin.

---

## 6. TypeScript 5 → 6 (+ @types/node 22 → 25)

**Packages:** `typescript` 5.9.3 → 6.0.3, `@types/node` 22.19.20 → 25.9.2

**Affected packages:** All (`@wivwav/*`, root)

### Breaking changes relevant to this codebase

TypeScript 6.0 is the most cross-cutting migration. Save it for last or run it in a separate branch against a stable codebase.

- **`strict` defaults to `true`** in TypeScript 6.0. The project already enables `strict: true` — no behavioral change expected, but verify all `tsconfig.json` files.
- **`module` default changes** from `commonjs` to `esnext`; **`target` default** from `es2020` to `es2025`. Explicitly set these in every `tsconfig.json` to preserve current behavior or consciously adopt the new defaults.
- **`types` defaults to `[]`** (empty array). Any package relying on auto-included `@types/*` packages (e.g., `@types/node`) must now explicitly declare `"types": ["node"]` in its `tsconfig.json`.
- **`moduleResolution: "node"` (node10) deprecated.** If any package uses `moduleResolution: "node"`, migrate to `"bundler"` or `"nodenext"`.
- **`baseUrl` deprecated** as a module lookup root. Packages that use `baseUrl` for path resolution must migrate to `paths` or `moduleResolution: bundler`.
- **`module: commonjs` / `module: umd` / `module: amd` / `module: systemjs` removed.** Confirm all packages use `module: "esnext"` or `"nodenext"`.
- **`esModuleInterop: false` and `allowSyntheticDefaultImports: false` no longer permitted** — interop is always enabled. Both are currently set to `true` or left at default — no impact expected.
- **`outFile` removed.** Not used in this monorepo.
- **`downlevelIteration` removed** — only applied with `target: es5`. Not used.
- **`@types/node` 22 → 25** — Review any Node.js API usages for type-level changes. Node 24 is the project's runtime target.

### Migration steps

1. Audit every `tsconfig.json` in the monorepo for deprecated options (`moduleResolution: node`, `baseUrl`, `module: commonjs`, missing `types` array).
2. Add `"types": ["node"]` (or the relevant type packages) to each package's `tsconfig.json` that relies on ambient Node.js types.
3. `pnpm add -D typescript@^6 @types/node@^25 -w`
4. Run `pnpm typecheck` — expect a wave of errors from the strict defaults and changed type resolution. Fix iteratively.
5. Run `pnpm lint && pnpm test`.
6. This migration should be done last, after the other packages have stabilized, since it affects all packages simultaneously.

### Rollback plan

`pnpm add -D typescript@^5 @types/node@^22 -w`. Configuration changes to `tsconfig.json` files should be reverted from git. No application logic changes.

---

## 7. Vitest 3 → 4

**Package:** `vitest` 3.2.6 → 4.1.8

**Affected packages:** `@wivwav/agents`, `@wivwav/api`, `@wivwav/queue`, `@wivwav/scraper`, `@wivwav/web`

### Breaking changes relevant to this codebase

- **Vite ≥ 6.0.0 required.** Verify `vite` is at v6+ in the monorepo (it should be, given Vitest 3 requires Vite 5+).
- **Node.js ≥ 20.0.0 required** — compatible.
- **Pool architecture rewritten:**
  - `maxThreads`/`maxForks` consolidated to `maxWorkers`
  - `singleThread`/`singleFork` replaced with `maxWorkers: 1, isolate: false`
  - `poolOptions` removed; sub-options are now top-level
- **`workspace` option renamed to `projects`** in vitest config.
- **Coverage changes:**
  - `coverage.all` and `coverage.extensions` removed
  - `coverage.ignoreEmptyLines` removed
  - `coverage.experimentalAstAwareRemapping` removed (now default)
  - Must explicitly define `coverage.include` to report uncovered files
- **Default exclusions simplified** — `dist`, `cypress`, and config files no longer auto-excluded; use `test.dir` instead.
- **Reporter API overhaul** — if any package uses custom reporters or the `onCollected`/`onTaskUpdate` hooks, these are removed.
- **`basic` reporter removed**; `verbose` reporter now prints flat list; use `tree` for hierarchy.
- **`vi.fn().getMockName()` returns `'vi.fn()'` instead of `'spy'`** — check any test assertions on mock names.
- **`vi.restoreAllMocks()` only affects manual spies**, not automocks — audit teardown patterns.
- **`vi.fn().mock.invocationCallOrder` starts at `1`** (was `0`).

### Migration steps

1. No `vitest.config.ts` files currently exist in the monorepo — Vitest is configured via `package.json` scripts only. Check each package's `package.json` `"test"` script for flags that may be affected by deprecated pool options (`maxThreads`, `maxForks`, `singleThread`, `singleFork`), and the root-level `vitest.config.ts` if one is introduced.
2. `pnpm add -D vitest@^4 -w`
3. Run `pnpm test` — fix any configuration errors, then fix test assertion failures.
4. Run `pnpm typecheck`.

### Rollback plan

`pnpm add -D vitest@^3 -w`. Config changes to `vitest.config.ts` files should be reverted from git. No application logic changes.

---

## 8. Zod 3 → 4

**Package:** `zod` 3.25.76 → 4.4.3

**Affected packages:** `@wivwav/api`, `@wivwav/scraper`

### Breaking changes relevant to this codebase

Current usage is limited to `apps/api/src/config.ts` (env var validation). This is a small migration.

- **`z.string().url()` deprecated** — migrate to top-level `z.url()`. Used in `apps/api/src/config.ts` for `DATABASE_URL`, `MEILISEARCH_HOST`, `OLLAMA_BASE_URL`.
- **`z.string().email()`, `z.string().uuid()` deprecated** — migrate to `z.email()`, `z.uuid()`. Not currently used in the codebase.
- **`error` parameter replaces `message`, `invalid_type_error`, `required_error`** in schema constructors.
- **`z.record()` requires two arguments** — single-argument `z.record(valueSchema)` is dropped. Not currently used.
- **`z.number()` rejects infinite values** — no impact unless any schema accepts `Infinity`.
- **`z.number().int()` restricts to safe integer range** — audit integer schemas.
- **`z.function()` no longer returns a `ZodSchema`** — it is now a function factory. Not currently used.
- **Object method changes:** `z.strictObject()` replaces `.strict()`, `z.looseObject()` replaces `.passthrough()`. Not currently used.
- **`.nonempty()` returns `string[]` not `[string, ...string[]]`** — review any downstream type usage.
- **`z.promise()` deprecated** — not currently used.
- **Default behaviour in optional fields changed:** `z.string().default("x").optional()` now returns `{ a: "x" }` when key is absent. Audit any schema where `.default().optional()` is chained.
- A community codemod ([`zod-v3-to-v4`](https://github.com/nicoespeon/zod-v3-to-v4)) is available for automated migration.

### Migration steps

1. Run the community codemod: `npx zod-v3-to-v4 apps/api/src apps/scraper/src`
2. `pnpm add zod@^4 -F @wivwav/api -F @wivwav/scraper`
3. Manually update `apps/api/src/config.ts`: `z.string().url()` → `z.url()` (top-level).
4. Run `pnpm typecheck && pnpm lint && pnpm test`.

### Rollback plan

`pnpm add zod@^3 -F @wivwav/api -F @wivwav/scraper`. Revert source changes from git. No database or API protocol changes.

---

## Suggested execution order

Given cross-cutting dependencies, this order minimises rework:

1. **`@fastify/cors` v11** — self-contained, low risk. Good warm-up.
2. **`meilisearch` v0.58** — self-contained, rename-heavy but mechanical.
3. **`vitest` v4** — test-only change; easier to validate in isolation.
4. **`zod` v4** — small surface area in this codebase.
5. **`eslint` v10** — tooling only; flat config already in use.
6. **`next` v16** — larger surface but most breaking changes are already handled.
7. **`prisma` v7** — significant structural change (driver adapters, generator rename, output path). Needs local DB smoke test.
8. **`typescript` v6 + `@types/node` v25** — last, because it validates everything else compiles under stricter defaults.
