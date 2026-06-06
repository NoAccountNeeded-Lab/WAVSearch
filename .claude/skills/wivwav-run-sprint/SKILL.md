---
description: Run a development sprint by working on one ready issue, or a specific issue number if provided. Spawns 1 worker agent, implementing one issue and opening a draft PR. Uses the host agent's built-in sub-agent spawning — no separate AI API key required.
argument-hint: "[issue-number]"
---

# Run Sprint

Works on one issue at a time using a Claude Code sub-agent.
The worker runs in an isolated git worktree to keep the main working tree clean.

This command is intentionally single-worker. It does not run multiple issues concurrently. True multi-worker sprint orchestration requires a separate command/update that assigns multiple agent indexes and preserves multiple active worktrees.

## Steps

1. Generate a Sprint-Run ID for this run:
   ```bash
   SPRINT_RUN_ID="run-sprint/$(date -u +%Y-%m-%dT%H:%M)"
   ```

2. Prune stale git metadata, but do **not** remove worktree directories blindly:
   ```bash
   git worktree prune
   git worktree list
   ```

   If an old `.claude/worktrees/...` directory is clearly stale, remove only that specific worktree after confirming it is not an active worker. Do not run a loop that removes all `.claude/worktrees/*`; concurrent or long-running workers may still be using them.

3. Select the target issue:

   - If `$ARGUMENTS` contains an issue number, use that issue.
   - If no issue number is provided, list ready issues:

   ```bash
   gh issue list --label status:ready --json number,title --limit 10
   ```

4. If no issue number was provided and none are labeled `status:ready`: report "No issues labeled status:ready. Nothing to do." and stop.

5. Fetch the selected issue and verify it is runnable:
   ```bash
   gh issue view {N} --json number,title,body,labels,state
   ```

   Stop if:
   - The issue is not open.
   - The issue is already labeled `status:in-progress`.
   - The issue is not labeled `status:ready` and it was not explicitly supplied by the user.

6. **Readiness pre-flight** — check the selected issue body for acceptance criteria before committing a worker to it:

   ```bash
   gh issue view {N} --json body --jq '.body'
   ```

   The issue body must contain at least one of these markers (case-insensitive):
   - `acceptance criteria`
   - `done when`
   - `## ac`
   - A non-empty checklist (`- [ ]`)

   If none are present, **do not spawn a worker**. Instead:
   - Post a comment on the issue: "🤖 **orchestrator** · `run-sprint` · {date}\n\nIssue is missing acceptance criteria. Add them before this issue can be picked up by a sprint worker."
   - Remove `status:ready`, add `status:stuck`
   - Report to the user: "Issue #{N} has no acceptance criteria — labeled status:stuck. Fix the issue description and re-label status:ready to queue it again."
   - Stop.

7. Take the selected issue only. If no issue number was provided and more than 1 issue is ready, report the extras by number as queued for the next sprint.
   Assign it agent index **1** (the first and only worker slot; human/local is always 0).

8. Derive the branch name for that issue (before spawning):
   - Use prefix and slug rules from `.claude/core.md` (feat/fix/docs/chore + issue-N-slug).

9. Run setup:
   ```bash
   gh issue edit N --add-label status:in-progress --remove-label status:ready
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker starting. Branch: {branch-name} · Sprint: {SPRINT_RUN_ID}"
   ```

10. Spawn the worker — one `Agent` call with `isolation: "worktree"`.
   If the Agent call itself fails (spawn error before the worker runs):
   ```bash
   gh issue edit N --remove-label status:in-progress --add-label status:stuck
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker failed to start: {error}. Labeled status:stuck for triage."
   ```
   Report the failure and stop.

   **Worker prompt** (fill in N, branch-name, SPRINT_RUN_ID):

   ---
   Read `.claude/core.md` and `.claude/roles/worker.md` before doing anything else.
   Keep startup context lean: do not read `AGENTS.md`, package manifests, or broad directory listings unless your plan identifies a specific need for them.

   You are implementing issue #{N}.

   First fetch the issue details:
   `gh issue view {N} --json number,title,body,labels`

   Before reading source files, use the fetched issue details to write a scoped plan that names the likely files and the evidence you need from each one.

   Your branch: {branch-name}
   Agent-Role: worker
   Agent-Index: 1
   Sprint-Run: {SPRINT_RUN_ID}
   ---

   Do not inline the full issue body into the worker prompt. This keeps spawn-time context small and should be mirrored by equivalent Codex, Gemini, Copilot, Cursor, Ollama, or other agent orchestration that runs sprint workers.

11. Wait for the worker to complete.

12. Clean up only the worker worktree created for this run, regardless of success or failure. The work should now be on a pushed branch:
    ```bash
    git worktree remove --force .claude/worktrees/{worktree-dir}
    git worktree prune
    ```

13. Post a summary comment on the issue:
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

14. Report sprint summary:
    - Whether the issue → draft PR opened or failed/stuck
    - How many issues remain queued with status:ready for the next sprint
