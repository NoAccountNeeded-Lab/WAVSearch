---
description: Finish a WAVSearch issue by validating changes, committing with the project format, pushing the branch, and opening a draft PR. Use when implementation work is complete and the user asks to finish, wrap up, ship, commit, push, or open a PR.
argument-hint: "[issue-number]"
---

# Finish Issue

Use this skill only when the user explicitly asks to finish the current issue or invokes `/finish-issue`.

Read `.claude/core.md` for branch naming, commit format, and attribution conventions. Read `AGENTS.md` only if the task requires deep workflow or architecture reference. Do not commit, push, or open a PR if validation fails.

1. Confirm the current branch is not `main`, `master`, or detached `HEAD`.
2. Identify the issue number from `$ARGUMENTS`, the branch name, or the user's request.
3. Inspect `git status --short` and `git diff --stat` to understand the pending changes.
4. If files under `apps/web` changed, read `docs/BRAND.md` now (if not already read this session) and include accessibility QA notes in the PR body.
5. If files under `apps/api/src/routes/` changed, verify the API routes table in `AGENTS.md` is current and stage it if it changed.
6. Run final validation from the repository root:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
7. If validation fails, stop. Report the failure and do not commit.
8. Stage only relevant files for this issue. Do not stage `.env` files, generated caches, unrelated work, or dirty files outside the issue scope.
9. Commit using the required format:
   - `type(scope): description (refs #N)` — use `fixes #N` when the issue fully resolves on merge
   - If Agent-Role, Agent-Index, and Sprint-Run are available in your context (you were spawned as a worker), add git trailers:
     ```bash
     git commit -m "type(scope): description (refs #N)" \
       --trailer "Agent-Role: {role}" \
       --trailer "Agent-Index: {index}" \
       --trailer "Sprint-Run: {sprint-run-id}" \
       --trailer "Co-Authored-By: {AI model name and version} <noreply@{provider}.com>"
     ```
     Use the Co-Authored-By value for your own AI model and provider — see `.claude/core.md` Attribution for the format and examples.
   - If running interactively (no agent context), use the standard commit without trailers.
10. Push the branch.
11. Open a draft PR linked to the issue. Fill the PR template with:
   - summary
   - tests run
   - accessibility notes for user-facing changes
   - QA notes
   - deployment impact, rollback plan, and smoke checks when relevant
12. Report the commit SHA, PR URL, and validation commands that passed.
13. Tell the user explicitly what to do next:
    - "The PR is open as a draft. When you're ready for review, run `/code-review` to get a full review, or mark it ready for review manually on GitHub."
    - "When the PR is approved, run `/merge-pr {N}` to rebase-merge and clean up the branch."
    - If there were accessibility or QA notes in the PR body, remind the user of any manual smoke checks that need human verification before merge.
