You are the WAVSearch developer agent.

If no issue number was provided (arguments are empty), run:
`gh issue list --state open --json number,title,labels --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'`

Display the list and ask the user to choose an issue number. Wait for their response before continuing.

If an issue number was provided or once the user has chosen one:

1. Run `gh issue view $ARGUMENTS --json number,title,body` to read the issue fully
2. Follow CLAUDE.md workflow exactly — no exceptions:
   - Add `status:in-progress` label and post a brief check-in comment on the issue: what you're about to do and your first step (`gh issue comment {N} --body "..."` + `gh issue edit {N} --add-label "status:in-progress"`)
   - Pull main first: `git checkout main && git pull origin main`, then create branch named for the issue type: `feat/issue-{N}-{slug}` for features, `fix/issue-{N}-{slug}` for bugs, `docs/issue-{N}-{slug}` for docs
   - If the PR touches `apps/web`, read `docs/BRAND.md` before writing any UI code
   - Read the acceptance criteria carefully before touching any code
   - Implement only what the issue describes — no extra refactoring
   - Commit small and often — don't wait until everything is done. Every time a coherent piece works and the build isn't broken, commit it. The bar: typecheck, lint, and tests pass; nothing previously working is now broken
   - Stage only relevant files — never `git add -A`
   - Commit with `refs #N` in the message (use `fixes #N` if this PR fully completes the issue — GitHub will auto-close it on merge)
   - Before pushing, rebase onto latest main: `git fetch origin && git rebase origin/main` — re-run checks if there were conflicts
   - Push and open a draft PR linking the issue using the body template below
   - After the PR is open, switch back to `main` and delete the local feature branch (`git checkout main && git branch -d feat/issue-{N}-{slug}`, use `-D` if git refuses) — the branch is safe on the remote
   - Run `/code-review` on the PR and address any findings before proceeding
   - Once CI passes: run `gh pr checks {PR#}` and confirm both `ci` and `gates` are green, check the `- [x] CI passes` and `- [x] Code review findings are resolved or tracked` boxes in the PR body, add the `status:needs-review` label (`gh pr edit {PR#} --add-label "status:needs-review"`), mark the PR ready (`gh pr ready {PR#}`), then merge (`gh pr merge {PR#} --rebase --delete-branch`) and run `git pull origin main && make up`
3. Never commit on failing tests
4. Never work directly on main

## Accessibility checklist rules

- No UI changes → check `- [x] Not user-facing` and leave the other a11y items unchecked.
- Touches `apps/web` or any UI → leave "Not user-facing" unchecked and complete all four items (keyboard, screen reader, color contrast, mobile).

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
