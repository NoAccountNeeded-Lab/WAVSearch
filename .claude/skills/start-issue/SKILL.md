---
description: Start a WAVSearch issue by labeling it in-progress, creating the branch, and posting a check-in comment. Use when beginning implementation work on an existing issue.
argument-hint: "[issue-number]"
---

# Start Issue

Use this skill when the user asks to start, pick up, or begin work on an issue, or when invoked by the `/run-sprint` orchestrator before spawning a worker agent.

Follow `AGENTS.md` as the source of truth for branch naming, labels, and commit format.

1. Identify the issue number from `$ARGUMENTS`, the current context, or the user's request.
2. Look up the issue: `gh issue view N --json number,title,body,labels,state`
3. Stop if the issue is closed, already labeled `status:in-progress`, or does not exist.
4. Confirm the working tree is clean: `git status --short`. Stop if there are uncommitted changes unrelated to this issue.
5. Check out main and pull: `git checkout main && git pull origin main`
6. Derive the branch name using the prefix from `AGENTS.md`:
   - `feat/issue-N-{slug}` for features
   - `fix/issue-N-{slug}` for bugs
   - `docs/issue-N-{slug}` for documentation
   - `chore/issue-N-{slug}` for maintenance
   - Slug: issue title lowercased, spaces → hyphens, strip non-alphanumeric except hyphens, truncate to 40 chars.
7. Create the branch: `git checkout -b {branch-name}`
8. Add label `status:in-progress` to the issue: `gh issue edit N --add-label status:in-progress`
9. Remove label `status:ready` if present: `gh issue edit N --remove-label status:ready`
10. Post check-in comment: `gh issue comment N --body "Starting work on this issue."`
11. Report: branch name, issue title, and the full issue body so the user can see the acceptance criteria.
12. Tell the user explicitly what to do next:
    - "Implement the changes described in the issue above."
    - "When implementation is complete, run `/review-pipeline {N}` to run the full review suite before finishing."
    - "When the review passes, run `/finish-issue {N}` to validate, commit, push, and open the draft PR."
