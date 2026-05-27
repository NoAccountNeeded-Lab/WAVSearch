You are the WAVSearch developer agent.

If no issue number was provided (arguments are empty), run:
`gh issue list --state open --json number,title,labels --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'`

Display the list and ask the user to choose an issue number. Wait for their response before continuing.

If an issue number was provided or once the user has chosen one:

1. Run `gh issue view $ARGUMENTS --json number,title,body` to read the issue fully
2. Follow CLAUDE.md workflow exactly — no exceptions:
   - Pull main first: `git checkout main && git pull origin main`, then create branch named for the issue type: `feat/issue-{N}-{slug}` for features, `fix/issue-{N}-{slug}` for bugs, `docs/issue-{N}-{slug}` for docs
   - Read the acceptance criteria carefully before touching any code
   - Implement only what the issue describes — no extra refactoring
   - Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` — fix any failures before committing
   - Stage only relevant files — never `git add -A`
   - Commit with `refs #N` in the message (use `fixes #N` if this PR fully completes the issue — GitHub will auto-close it on merge)
   - Before pushing, rebase onto latest main: `git fetch origin && git rebase origin/main` — re-run checks if there were conflicts
   - Push and open a draft PR linking the issue using the body template below
   - After the PR is open, switch back to `main` and delete the local feature branch (`git checkout main && git branch -d feat/issue-{N}-{slug}`, use `-D` if git refuses due to squash merge SHA mismatch) — the branch is safe on the remote
   - Once CI passes: run `gh pr checks {PR#}` and confirm both `ci` and `gates` are green, check the `- [ ] CI passes` box in the PR body, mark the PR ready for review (`gh pr ready {PR#}`), then merge (`gh pr merge {PR#} --squash --delete-branch`) and run `git pull origin main && pnpm install`
   - If the Prisma schema changed in this PR, also run `pnpm db:generate` after pulling
3. Never commit on failing tests
4. Never work directly on main

## Accessibility checklist rules

- No UI changes → check `- [x] Not user-facing` and leave the other a11y items unchecked. The SDLC gate will pass.
- Touches `apps/web` or any UI → leave "Not user-facing" unchecked and complete all four items (keyboard, screen reader, color contrast, mobile). The gate will fail if any are missing.

## PR body template

Every PR must use this exact structure (fill in the bracketed sections):

```
## Summary

- [bullet points describing what changed and why]

Fixes/Refs #[issue number]

## Review Checklist

- [ ] Linked issue is included above.
- [ ] CI passes.
- [ ] Tests were added or an explicit test-gap explanation is included.
- [ ] Code review findings are resolved or tracked.
- [ ] No secrets, `.env` files, generated caches, or unrelated changes are included.

## Accessibility Checklist

- [ ] Not user-facing.
- [ ] Keyboard behavior checked.
- [ ] Screen reader semantics checked.
- [ ] Color contrast checked.
- [ ] Mobile viewport checked.
- [ ] Map, chart, image, or visual-only information has a text alternative.

## QA Notes

- Manual checks: [what to test]
- Data or environment needed: [any setup required]
- Screenshots/logs: [attach or note N/A]

## Release Notes

- Deployment impact: [none / describe]
- Rollback plan: [none / describe]
- Post-release smoke checks: [list checks]
```
