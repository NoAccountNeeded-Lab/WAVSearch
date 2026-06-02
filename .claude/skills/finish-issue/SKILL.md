---
description: Finish a WAVSearch issue by validating changes, committing with the project format, pushing the branch, and opening a draft PR. Use when implementation work is complete and the user asks to finish, wrap up, ship, commit, push, or open a PR.
argument-hint: "[issue-number]"
---

# Finish Issue

Use this skill only when the user explicitly asks to finish the current issue or invokes `/finish-issue`.

Follow `AGENTS.md` as the source of truth. Do not commit, push, or open a PR if validation fails.

1. Confirm the current branch is not `main`, `master`, or detached `HEAD`.
2. Identify the issue number from `$ARGUMENTS`, the branch name, or the user's request.
3. Inspect `git status --short` and `git diff --stat` to understand the pending changes.
4. If files under `apps/web` changed, confirm `docs/BRAND.md` was read and include accessibility QA notes in the PR body.
5. If files under `apps/api/src/routes/` changed, verify the API routes table in `AGENTS.md` is current and stage it if it changed.
6. Run final validation from the repository root:
   - `make typecheck`
   - `make lint`
   - `make test`
7. If validation fails, stop. Report the failure and do not commit.
8. Stage only relevant files for this issue. Do not stage `.env` files, generated caches, unrelated work, or dirty files outside the issue scope.
9. Commit using the required format from `AGENTS.md`:
   - `type(scope): description (refs #N)`
   - use `fixes #N` only when the issue is fully complete and should auto-close on merge.
10. Push the branch.
11. Open a draft PR linked to the issue. Fill the PR template with:
   - summary
   - tests run
   - accessibility notes for user-facing changes
   - QA notes
   - deployment impact, rollback plan, and smoke checks when relevant
12. Report the commit SHA, PR URL, and validation commands that passed.
