---
description: Run a development sprint by concurrently working on all issues labeled status:ready. Spawns up to 3 parallel worker agents, each implementing one issue and opening a draft PR. No Anthropic API key required — uses Claude Code's built-in Agent spawning.
argument-hint: ""
---

# Run Sprint

Orchestrates concurrent implementation of ready issues using parallel Claude Code sub-agents.
Each worker runs in an isolated git worktree so branches never conflict.

## Steps

1. List ready issues:
   ```
   gh issue list --label status:ready --json number,title,body --limit 10
   ```
2. If none: report "No issues labeled status:ready. Nothing to do." and stop.
3. Take the first 3 issues. If more than 3 are ready, report the extras by number as queued for the next sprint.
4. For each of the (up to 3) selected issues, derive its branch name now (before spawning):
   - Use the same prefix and slug rules as `/start-issue`.
5. Run setup for each issue (can be done sequentially before spawning):
   - `gh issue edit N --add-label status:in-progress --remove-label status:ready`
   - `gh issue comment N --body "Sprint worker starting. Branch: {branch-name}"`
6. Spawn all workers **in parallel** — one `Agent` call per issue, each with `isolation: "worktree"`.

   Use this prompt template for each worker (fill in N, title, body, branch-name):

   ---
   You are a WAVSearch worker agent implementing issue #N: {title}

   Issue description:
   {body}

   Your branch: {branch-name}

   Instructions:
   1. Create your branch first: `git checkout -b {branch-name}`
   2. Read `AGENTS.md` before writing any code.
   3. Read relevant source files for this task.
   4. Implement the issue following all conventions in `AGENTS.md`.
   5. When implementation is complete, run `/finish-issue N`.
      - `/finish-issue` validates (typecheck + lint + test), commits, pushes, and opens a draft PR.
      - If validation fails, fix the issues and retry `/finish-issue` up to 3 times.
   6. If you cannot complete the issue after retries:
      - Post a comment: `gh issue comment N --body "Worker failed: {reason}"`
      - Add label: `gh issue edit N --add-label status:blocked --remove-label status:in-progress`
      - Report failure with reason.

   Report back: the commit SHA and PR URL on success, or the failure reason.
   ---

7. Wait for all worker agents to complete.
8. For each worker result, post a summary comment on the issue:
   - Success: `gh issue comment N --body "Draft PR opened: {PR URL}. Commit: {SHA}."`
   - Failure: `gh issue comment N --body "Worker could not complete this issue: {reason}. Labeled status:blocked for triage."`
9. Report sprint summary:
   - How many issues → draft PRs opened
   - How many issues → failed / labeled blocked
   - How many issues → queued for next sprint (if any were skipped due to concurrency cap)
