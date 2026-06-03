---
description: Run a development sprint by working on issues labeled status:ready. Spawns 1 worker agent, implementing one issue and opening a draft PR. No Anthropic API key required — uses Claude Code's built-in Agent spawning.
argument-hint: ""
---

# Run Sprint

Works on one ready issue at a time using a Claude Code sub-agent.
The worker runs in an isolated git worktree to keep the main working tree clean.

## Steps

1. List ready issues:
   ```
   gh issue list --label status:ready --json number,title,body --limit 10
   ```
2. If none: report "No issues labeled status:ready. Nothing to do." and stop.
3. Take the first issue only. If more than 1 is ready, report the extras by number as queued for the next sprint.
4. Derive the branch name for that issue now (before spawning):
   - Use the same prefix and slug rules as `/start-issue`.
5. Run setup for the issue:
   - `gh issue edit N --add-label status:in-progress --remove-label status:ready`
   - `gh issue comment N --body "Sprint worker starting. Branch: {branch-name}"`
6. Spawn the worker — one `Agent` call with `isolation: "worktree"`.
   If the Agent call itself fails (spawn error before the worker runs):
   - `gh issue edit N --remove-label status:in-progress --add-label status:stuck`
   - `gh issue comment N --body "Sprint worker failed to start: {error}. Labeled status:stuck for triage."`
   - Report the failure and stop.

   Use this prompt template for the worker (fill in N, title, body, branch-name):

   ---
   You are a WAVSearch worker agent implementing issue #N: {title}

   Issue description:
   {body}

   Your branch: {branch-name}

   Instructions:
   1. Start from latest main before branching:
      `git fetch origin main && git checkout -b {branch-name} origin/main`
   2. Read `AGENTS.md` before writing any code.
   3. Read relevant source files for this task.
   4. Implement the issue following all conventions in `AGENTS.md`.
   5. When implementation is complete, run `/finish-issue N`.
      - `/finish-issue` validates (typecheck + lint + test), commits, pushes, and opens a draft PR.
      - If validation fails, fix the issues and retry `/finish-issue` up to 3 times.
   6. If you cannot complete the issue after retries:
      - Post a comment: `gh issue comment N --body "Worker failed: {reason}"`
      - Add label: `gh issue edit N --add-label status:stuck --remove-label status:in-progress`
      - Report failure with reason.

   Report back: the commit SHA and PR URL on success, or the failure reason.
   ---

7. Wait for the worker to complete.
8. Post a summary comment on the issue:
   - Success: `gh issue comment N --body "Draft PR opened: {PR URL}. Commit: {SHA}."`
   - Failure: `gh issue comment N --body "Worker could not complete this issue: {reason}. Labeled status:stuck for triage."`
9. Report sprint summary:
   - Whether the issue → draft PR opened or failed/stuck
   - How many issues remain queued with status:ready for the next sprint
