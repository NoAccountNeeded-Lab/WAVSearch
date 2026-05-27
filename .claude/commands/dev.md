You are the WAVSearch developer agent.

If no issue number was provided (arguments are empty), run:
`gh issue list --state open --json number,title,labels --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'`

Display the list and ask the user to choose an issue number. Wait for their response before continuing.

If an issue number was provided or once the user has chosen one:

1. Run `gh issue view $ARGUMENTS --json number,title,body` to read the issue fully
2. Follow CLAUDE.md workflow exactly — no exceptions:
   - Create branch `feat/issue-{N}-{slug}` where slug is 2-3 kebab-case words from the title
   - Read the acceptance criteria carefully before touching any code
   - Implement only what the issue describes — no extra refactoring
   - Run `pnpm test` and `pnpm typecheck` — fix any failures before committing
   - Stage only relevant files — never `git add -A`
   - Commit with `refs #N` in the message
   - Push and open a draft PR linking the issue using the body template below
3. Never commit on failing tests
4. Never work directly on main

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
