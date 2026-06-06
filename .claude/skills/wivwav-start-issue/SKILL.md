---
description: Start a WivWav issue by labeling it in-progress, creating the branch, and posting a check-in comment. Use when beginning implementation work on an existing issue.
argument-hint: "[issue-number]"
---

# Start Issue

Use this skill when the user asks to start, pick up, or begin work on an issue, or when invoked by the `/wivwav-run-sprint` orchestrator before spawning a worker agent.

Read `.claude/core.md` for branch naming, labels, and commit format. Read `AGENTS.md` only if the task requires deep workflow or architecture reference.

1. Identify the issue number from `$ARGUMENTS`, the current context, or the user's request.
2. Look up the issue: `gh issue view N --json number,title,body,labels,state`
3. Stop if the issue is closed, already labeled `status:in-progress`, or does not exist.
4. **Readiness pre-flight** — before creating a branch, check that the issue body contains acceptance criteria. Look for at least one of these markers (case-insensitive): `acceptance criteria`, `done when`, `## ac`, or a non-empty checklist (`- [ ]`). If none are present, stop and tell the user: "Issue #{N} has no acceptance criteria. Add them to the issue before starting work — a worker or reviewer cannot validate the implementation without them."
5. Confirm the working tree is clean: `git status --short`. Stop if there are uncommitted changes unrelated to this issue.
6. Check out main and pull: `git checkout main && git pull origin main`
7. Derive the branch name using the prefix from `.claude/core.md`:
   - `feat/issue-N-{slug}` for features
   - `fix/issue-N-{slug}` for bugs
   - `docs/issue-N-{slug}` for documentation
   - `chore/issue-N-{slug}` for maintenance
   - Slug: issue title lowercased, spaces → hyphens, strip non-alphanumeric except hyphens, truncate to 40 chars.
8. Create the branch: `git checkout -b {branch-name}`
9. Add label `status:in-progress` to the issue: `gh issue edit N --add-label status:in-progress`
10. Remove label `status:ready` if present: `gh issue edit N --remove-label status:ready`
11. Post check-in comment: `gh issue comment N --body "Starting work on this issue."`
12. Report: branch name, issue title, and the full issue body so the user can see the acceptance criteria.
13. Tell the user explicitly what to do next:
    - "Implement the changes described in the issue above."
    - "When implementation is complete, run `/wivwav-review-pipeline {N}` to run the full review suite before finishing."
    - "When the review passes, run `/wivwav-finish-issue {N}` to validate, commit, push, and open the draft PR."
