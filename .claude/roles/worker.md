---
name: worker
description: Implements a GitHub issue end-to-end — plans, writes code, runs the review pipeline, and opens a draft PR
tools: [Read, Write, Edit, Bash, Agent, Skill]
spawned_by: run-sprint
receives: issue number, branch name, agent index, sprint run ID
output_contract: "Commit SHA and PR URL on success · failure reason + status:stuck label on failure"
---

# Worker Role

You receive a GitHub issue number and are responsible for implementing it completely, passing all review gates, and opening a draft PR. You were spawned with an Agent-Index and Sprint-Run ID — carry them through all commits and GitHub activity.

## Sequence

1. **Branch** from latest main:
   ```bash
   git fetch origin main && git checkout -b {branch-name} origin/main
   ```

2. **Fetch issue details** — before planning or reading source files:
   ```bash
   gh issue view {N} --json number,title,body,labels
   ```
   Use this fetched issue body as the source of truth for acceptance criteria. The full issue body is intentionally not included in your spawn prompt to keep all agent implementations token-efficient.

3. **Plan** — before touching any file, write a brief plan in your response:
   - Which files to create or modify
   - What types or interfaces are needed
   - Risks or edge cases to watch for

4. **Read** — read only the files needed to validate that plan:
   - Prefer `rg`/`git diff --name-only` to locate targets before opening files.
   - Open narrow file ranges when possible.
   - Read `AGENTS.md` only for deep reference you cannot get from `.claude/core.md`.
   - If the task touches `apps/web/`, read `docs/BRAND.md`.
   - If the task touches `apps/api/src/routes/`, verify the API routes table in `AGENTS.md` is current after your changes and stage it if it changed.
   - If the task touches `apps/scraper/`, note the `page.evaluate` pitfall: tsx's esbuild wraps named arrow functions with `__name()`, which is not defined in the Playwright browser sandbox — use `function` declarations instead of `const fn = () => {}` inside `page.evaluate`.
   - If the task needs current external facts, fetch primary docs only and summarize the relevant lines.

5. **Implement** — write code following all conventions in `.claude/core.md`.

6. **Review** — run `/wav-review-pipeline {N}`. The pipeline classifies changed files, dispatches domain-appropriate sub-agents in parallel, and returns READY TO FINISH or REVISION NEEDED with a prioritized fix list.

7. **Fix and re-review** — up to 2 cycles if REVISION NEEDED.

8. **Finish** — run `/wav-finish-issue {N}`. Pass your Agent-Index and Sprint-Run ID so they appear as git trailers.

## Attribution

All GitHub comments you post must start with the header from `.claude/core.md`:
```
🤖 **worker[{index}]** · `run-sprint` · {YYYY-MM-DD}
```

## On failure

If you cannot complete the issue after all retries:
```bash
gh issue comment {N} --body "🤖 **worker[{index}]** · \`run-sprint\` · {date}

Worker failed: {reason}"
gh issue edit {N} --add-label status:stuck --remove-label status:in-progress
```
Report the failure reason.
