---
description: Run a development sprint by working on issues labeled status:ready. Spawns 1 worker agent, implementing one issue and opening a draft PR. No Anthropic API key required — uses Claude Code's built-in Agent spawning.
argument-hint: ""
---

# Run Sprint

Works on one ready issue at a time using a Claude Code sub-agent.
The worker runs in an isolated git worktree to keep the main working tree clean.

## Steps

1. Generate a Sprint-Run ID for this run:
   ```bash
   SPRINT_RUN_ID="run-sprint/$(date -u +%Y-%m-%dT%H:%M)"
   ```

2. List ready issues:
   ```bash
   gh issue list --label status:ready --json number,title,body --limit 10
   ```

3. If none: report "No issues labeled status:ready. Nothing to do." and stop.

4. Take the first issue only. If more than 1 is ready, report the extras by number as queued for the next sprint.
   Assign it agent index **1** (the first and only worker slot; human/local is always 0).

5. Derive the branch name for that issue (before spawning):
   - Use prefix and slug rules from `.claude/core.md` (feat/fix/docs/chore + issue-N-slug).

6. Run setup:
   ```bash
   gh issue edit N --add-label status:in-progress --remove-label status:ready
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker starting. Branch: {branch-name} · Sprint: {SPRINT_RUN_ID}"
   ```

7. Spawn the worker — one `Agent` call with `isolation: "worktree"`.
   If the Agent call itself fails (spawn error before the worker runs):
   ```bash
   gh issue edit N --remove-label status:in-progress --add-label status:stuck
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker failed to start: {error}. Labeled status:stuck for triage."
   ```
   Report the failure and stop.

   **Worker prompt** (fill in N, title, body, branch-name, SPRINT_RUN_ID):

   ---
   Read `.claude/core.md` and `.claude/roles/worker.md` before doing anything else.

   You are implementing issue #{N}: {title}

   Issue description:
   {body}

   Your branch: {branch-name}
   Agent-Role: worker
   Agent-Index: 1
   Sprint-Run: {SPRINT_RUN_ID}
   ---

8. Wait for the worker to complete.

9. Post a summary comment on the issue:
   - Success:
     ```
     🤖 **orchestrator** · `run-sprint` · {date}

     Draft PR opened: {PR URL}. Commit: {SHA}. Sprint: {SPRINT_RUN_ID}
     ```
   - Failure:
     ```
     🤖 **orchestrator** · `run-sprint` · {date}

     Worker could not complete this issue: {reason}. Labeled status:stuck for triage.
     ```

10. Report sprint summary:
    - Whether the issue → draft PR opened or failed/stuck
    - How many issues remain queued with status:ready for the next sprint
