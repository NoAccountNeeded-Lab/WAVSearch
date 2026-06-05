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

2. Prune any stale worktrees left by a previous crashed run:
   ```bash
   git worktree prune
   for d in .claude/worktrees/*/; do git worktree remove --force "$d" 2>/dev/null; done
   git worktree prune
   ```

3. List ready issues:
   ```bash
   gh issue list --label status:ready --json number,title --limit 10
   ```

4. If none: report "No issues labeled status:ready. Nothing to do." and stop.

5. Take the first issue only. If more than 1 is ready, report the extras by number as queued for the next sprint.
   Assign it agent index **1** (the first and only worker slot; human/local is always 0).

6. Derive the branch name for that issue (before spawning):
   - Use prefix and slug rules from `.claude/core.md` (feat/fix/docs/chore + issue-N-slug).

7. Run setup:
   ```bash
   gh issue edit N --add-label status:in-progress --remove-label status:ready
   gh issue comment N --body "🤖 **orchestrator** · \`run-sprint\` · $(date -u +%Y-%m-%d)

   Sprint worker starting. Branch: {branch-name} · Sprint: {SPRINT_RUN_ID}"
   ```

8. Spawn the worker — one `Agent` call with `isolation: "worktree"`.
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

9. Wait for the worker to complete.

10. Clean up the worktree regardless of success or failure — the work is now on a pushed branch:
    ```bash
    git worktree remove --force .claude/worktrees/{worktree-dir}
    git worktree prune
    ```

11. Post a summary comment on the issue:
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

12. Report sprint summary:
    - Whether the issue → draft PR opened or failed/stuck
    - How many issues remain queued with status:ready for the next sprint
