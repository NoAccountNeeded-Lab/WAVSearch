---
description: Run a development sprint by working on one or more ready issues, or specific issue numbers if provided. Spawns one worker agent per issue, each implementing one issue and opening a draft PR. Uses the host agent's built-in sub-agent spawning — no separate AI API key required.
argument-hint: "[issue-number ...]"
---

# Run Sprint

Works on one or more issues using Claude Code sub-agents.
Each worker runs in an isolated git worktree to keep the main working tree clean.

When `$ARGUMENTS` contains a space-delimited list of issue numbers, spawn one worker per issue and run them concurrently. Assign agent indexes in argument order: issue 1 gets `Agent-Index: 1`, issue 2 gets `Agent-Index: 2`, and so on. Human/local remains index 0.

When no issue numbers are provided, select at most one `status:ready` issue. Automatic issue selection remains single-worker to avoid two orchestrators racing to claim the same ready issue.

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

3. Select target issues:

   - If `$ARGUMENTS` contains issue numbers, parse it as a space-delimited list. Each token must be a decimal issue number. Reject duplicate numbers before touching GitHub state.
   - If no issue number is provided, list ready issues:

   ```bash
   gh issue list --label status:ready --json number,title --limit 10
   ```

4. If no issue number was provided and none are labeled `status:ready`: report "No issues labeled status:ready. Nothing to do." and stop.

5. If no issue number was provided and multiple issues are labeled `status:ready`, take only the first one and report the extras by number as queued for the next sprint.

6. Fetch each selected issue and verify it is runnable before spawning any worker:
   ```bash
   gh issue view {N} --json number,title,body,labels,state
   ```

   Stop if:
   - The issue is not open.
   - The issue is already labeled `status:in-progress`.
   - The issue is not labeled `status:ready` and it was not explicitly supplied by the user.

   If any selected issue fails verification, stop before changing labels or spawning workers. Report every failing issue and the reason.

7. **Readiness pre-flight** — check each selected issue body for acceptance criteria before committing workers:

   ```bash
   gh issue view {N} --json body --jq '.body'
   ```

   The issue body must contain at least one of these markers (case-insensitive):
   - `acceptance criteria`
   - `done when`
   - `## ac`
   - A non-empty checklist (`- [ ]`)

   If an issue has no acceptance criteria:
   - Post a comment on that issue: "🤖 **orchestrator** · `run-sprint` · {date}\n\nIssue is missing acceptance criteria. Add them before this issue can be picked up by a sprint worker."
   - Remove `status:ready`, add `status:stuck` for that issue.

   If any selected issue is missing acceptance criteria, do not spawn workers for the remaining issues in the same invocation. Report which issues were labeled `status:stuck` and ask the user to rerun with the corrected issue set.

8. Derive branch names for all selected issues before spawning:
   - Use prefix and slug rules from `.claude/core.md` (feat/fix/docs/chore + issue-N-slug).
   - Branch names must be unique. If two selected issues would produce the same branch name, append one more slug word from the issue title or the issue number until unique.

9. Reserve all selected issues before spawning workers:
   ```bash
   gh issue edit N --add-label status:in-progress --remove-label status:ready
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker starting. Branch: {branch-name} · Worker: {agent-index} · Sprint: {SPRINT_RUN_ID}"
   ```

   Complete this reservation step for every selected issue before the first worker is spawned. If reservation fails for any issue, revert labels for issues already reserved in this invocation (`status:in-progress` removed, `status:ready` restored), post a failure comment on the affected issue, report the error, and stop.

10. Spawn workers concurrently — one `Agent` call per selected issue with `isolation: "worktree"`.
   If the Agent call itself fails (spawn error before the worker runs):
   ```bash
   gh issue edit N --remove-label status:in-progress --add-label status:stuck
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker failed to start: {error}. Labeled status:stuck for triage."
   ```
   Report the failure and stop.

   **Worker prompt** (fill in N, branch-name, agent-index, SPRINT_RUN_ID):

   ---
   Read `.claude/core.md` and `.claude/roles/worker.md` before doing anything else.
   Keep startup context lean: do not read `AGENTS.md`, package manifests, or broad directory listings unless your plan identifies a specific need for them.

   You are implementing issue #{N}.

   First fetch the issue details:
   `gh issue view {N} --json number,title,body,labels`

   Before reading source files, use the fetched issue details to write a scoped plan that names the likely files and the evidence you need from each one.

   Your branch: {branch-name}
   Agent-Role: worker
   Agent-Index: {agent-index}
   Sprint-Run: {SPRINT_RUN_ID}
   ---

   Do not inline the full issue body into the worker prompt. This keeps spawn-time context small and should be mirrored by equivalent Codex, Gemini, Copilot, Cursor, Ollama, or other agent orchestration that runs sprint workers.

11. Wait for all workers to complete.

12. Clean up only the worker worktrees created for this run, regardless of success or failure. The work should now be on pushed branches:
    ```bash
    git worktree remove --force .claude/worktrees/{worktree-dir}
    git worktree prune
    ```

   Do not remove `.claude/worktrees/*` with a glob or loop over every directory. Remove only the specific worktree path returned for each worker spawned in this invocation.

13. Post a summary comment on each issue:
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
    - One line per issue: draft PR opened or failed/stuck
    - How many issues remain queued with status:ready for the next sprint
