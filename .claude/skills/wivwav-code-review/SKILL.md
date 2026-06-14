---
description: Run the WivWav code review pipeline against actual changed files. Auto-detects change type and routes to the matching pipeline — only the relevant sub-agents run. Use after implementation, before /wivwav-finish-issue.
argument-hint: "[issue-number]"
---

# WivWav Code Review

Classifies the changed files, routes to the matching named pipeline, and runs only the sub-agents that are relevant for that type of change. Each sub-agent reads its own role file in `.claude/roles/` for instructions.

---

## Step 1 — Identify changed files

```bash
git diff --name-only HEAD
git diff --name-only --cached
git ls-files --others --exclude-standard
```

Combine all three. Exclude `.env` files, `node_modules`, `dist`, and generated Prisma output.

---

## Step 2 — Classify the change type

Inspect the file list and assign a **primary type**. If multiple types apply, use the **mixed** pipeline.

| Type       | Files that trigger it                                              |
| ---------- | ------------------------------------------------------------------ |
| **web**    | any file under `apps/web/`                                         |
| **code**   | `.ts` or `.tsx` files outside `apps/web/`                         |
| **docs**   | `.md` files, `SKILL.md` files, `.claude/` instruction files       |
| **config** | `.json`, `.yaml`, `.yml`, `.sh`, `Dockerfile*`, `Makefile`        |
| **content**| files under `content/`, `blog/`, or `posts/` *(future use)*      |
| **mixed**  | files from more than one type above                               |

---

## Step 3 — Read shared context once

Before spawning any sub-agent, read `.claude/core.md` once in the orchestrator context and keep the exact Markdown content available as `{core-context}`.

Do not ask each sub-agent to read `.claude/core.md`. The core context is stable and shared across all review roles, so pass it into each sub-agent prompt as a quoted block. This applies to Claude Code sub-agents and any equivalent Codex, Gemini, Copilot, Cursor, Ollama, or other agent orchestration that mirrors this pipeline.

---

## Step 4 — Select model tier for sub-agents

Choose the model tier based on the detected change type. If your platform or provider supports per-agent model selection, apply the appropriate tier to every sub-agent spawned in this step. If it does not, use your default model throughout.

| Tier | When to use | Provider examples |
| ---- | ----------- | ----------------- |
| **lightweight** | `docs`, `config` pipelines — consistency and clarity checks, no deep reasoning needed | Claude Haiku · GPT-4o-mini · Gemini Flash · small Ollama model (≤7B) · Copilot fast mode |
| **standard** | `code`, `web`, `mixed` pipelines — type safety, logic bugs, security, accessibility | Claude Sonnet · GPT-4o · Gemini Pro · large Ollama model (≥13B) · Copilot standard mode |

This applies equally to Claude Code, Codex, Gemini, Copilot, Cursor, Ollama, and any other agent that runs this pipeline.

---

## Step 5 — Run the pipeline for the detected type

Jump to the matching section below. Each sub-agent prompt follows this template:

```
Project core context is already supplied below. Do not re-read `.claude/core.md`.

<core-context>
{core-context}
</core-context>

Read `.claude/roles/{role}.md` for your role instructions and output format.

Issue number: {N}
Your scoped file list: {files for this job}

Use your Read tool to read each file before reviewing.
Use Bash to run `git diff origin/main -- {file}` to see what changed.
Follow the output format defined in your role file exactly.
```

---

### Pipeline: web

*Triggered when any `apps/web/` file changed.*

Spawn these sub-agents **in parallel**:

1. **reviewer** (`.claude/roles/reviewer.md`) — bugs, type safety, security, principles
2. **accessibility** (`.claude/roles/accessibility.md`) — WCAG 2.1 AA, keyboard, screen reader, touch targets, mobile
3. **tester** (`.claude/roles/tester.md`) — identify coverage gaps, write missing Vitest tests to disk
4. **qa** (`.claude/roles/qa.md`) — validate against acceptance criteria

For **qa**, also include: `gh issue view N --json title,body`
For **tester**, also include: "Write any missing tests directly to disk using your Write/Edit tools."

---

### Pipeline: code

*Triggered when `.ts` / `.tsx` files outside `apps/web/` changed.*

Spawn in parallel:

1. **reviewer** (`.claude/roles/reviewer.md`) — bugs, type safety, security, principles
2. **tester** (`.claude/roles/tester.md`) — missing Vitest coverage, write tests to disk
3. **qa** (`.claude/roles/qa.md`) — acceptance criteria coverage
4. **docs-accuracy** (`.claude/roles/docs-accuracy.md`) — **only if** the changed file list includes any file under `apps/api/src/routes/`. Scope it to verifying the API routes table in `AGENTS.md` is current. Skip otherwise.

*No accessibility sub-agent — no user-facing UI changed.*

---

### Pipeline: docs

*Triggered when `.md`, `SKILL.md`, or `.claude/` instruction files changed.*

Spawn in parallel:

1. **reviewer** (`.claude/roles/reviewer.md`) — clarity, accuracy, internal consistency, contradictions
2. **docs-accuracy** (`.claude/roles/docs-accuracy.md`) — verify that any code claims in the docs match the actual source (commands, file paths, API routes, env vars, config defaults)
3. **qa** (`.claude/roles/qa.md`) — acceptance criteria coverage

*No tester — docs have no test counterparts.*
*No accessibility — no rendered UI changed.*

---

### Pipeline: config

*Triggered when `.json`, `.yaml`, `.yml`, `.sh`, `Dockerfile*`, or `Makefile` changed.*

Spawn in parallel:

1. **reviewer** (`.claude/roles/reviewer.md`) — correctness, security (secrets exposure, privilege escalation, unsafe defaults)
2. **qa** (`.claude/roles/qa.md`) — acceptance criteria coverage

*No tester — config files have no unit test counterparts.*
*No accessibility — no user-facing UI changed.*

---

### Pipeline: content *(future)*

*Triggered when files under `content/`, `blog/`, or `posts/` change.*

Spawn in parallel:

1. **content-reviewer** — grammar, clarity, consistent voice, factual accuracy, tone for WivWav audience (wheelchair accessible vehicle buyers and caregivers)
2. **qa** (`.claude/roles/qa.md`) — acceptance criteria coverage

---

### Pipeline: mixed

*Triggered when files from more than one type changed in the same commit.*

Build the sub-agent list as the **union** of the matching individual pipelines — deduped. `reviewer` and `qa` run once even if multiple pipeline types match.

Example: `apps/web/` changes + `.md` changes → web + docs → reviewer (once) + accessibility + tester + docs-accuracy + qa (once).

---

## Step 6 — Collect results and report

After all sub-agents complete:

- **Track the flagged set**: record which sub-agents returned `REVISION_NEEDED: yes`. This list is used in Step 7 to scope the selective re-review — carry it forward.
- **Overall verdict**:
  - Any `REVISION_NEEDED: yes` → **REVISION NEEDED**
  - All `REVISION_NEEDED: no` → **READY TO FINISH**

- Report findings grouped by sub-agent, numbered, labeled [CRITICAL] / [WARNING] / [SUGGESTION].
- If REVISION NEEDED: a prioritized fix list — [CRITICAL] first, then [WARNING].

**Post results to the PR or issue:**

After reporting to the user, post the full findings and recommended fix plan as a comment on the PR (preferred) or the linked issue. Use `gh pr comment {PR#}` if a PR exists for the branch; otherwise use `gh issue comment {N}`.

Format the comment with the attribution header, then the full findings (grouped by sub-agent, labeled [CRITICAL] / [WARNING] / [SUGGESTION]), then a **Recommended fix plan** section that lists fixes in priority order with a one-line description of each change.

```bash
# Find the PR number for the current branch
gh pr list --head $(git branch --show-current) --json number --jq '.[0].number'

# Post the comment
gh pr comment {PR#} --body "$(cat <<'EOF'
🤖 **code-review[1]** · `wivwav-code-review` · {YYYY-MM-DD}

## Review verdict: {REVISION NEEDED | READY TO FINISH}

...findings...

## Recommended fix plan

...ordered fix list...
EOF
)"
```

If no PR exists yet (branch not pushed or PR not open), post to the issue instead:
```bash
gh issue comment {N} --body "..."
```

---

## Step 7 — Apply fixes and selective re-review

If REVISION NEEDED:

Ask the user: **"Should I apply the [CRITICAL] and [WARNING] fixes now?"**

- If **no**: stop here and wait for the user to direct next steps.
- If **yes**:
  1. Apply fixes in priority order ([CRITICAL] first). Report each fix as it is applied with the file and what changed.
  2. **Selective re-review** — re-run only the sub-agents from the flagged set (Step 6). Use the same model tier from Step 4. Sub-agents that were already clean do not run again.
  3. If all re-run agents return `REVISION_NEEDED: no`: the fix cycle is complete — continue to Step 8.
  4. If any agent still returns `REVISION_NEEDED: yes` after the selective re-review: this is the final cycle. Report the remaining findings. Ask the user: **"Some issues remain after the second review pass. Should I apply these fixes too, or handle them manually?"**
     - If yes: apply remaining [CRITICAL] and [WARNING] fixes, then continue to Step 8 without another re-review.
     - If no: note the outstanding issues and continue to Step 8.

Do not apply SUGGESTION-level items unless the user explicitly asks.

---

## Step 8 — Verify and leave changes for finish

After fixes are applied OR if the tester sub-agent wrote new test files:

1. Run `git status --short` and list every uncommitted file to the user.
2. Run `pnpm test` (from the repo root) to confirm everything still passes.
3. If tests fail: report the failure and ask the user how to proceed.
4. If tests pass: leave all review-cycle fixes uncommitted in the working tree.
5. Do **not** commit or push from `/wivwav-code-review`. `/wivwav-finish-issue` is the only command that should run final validation, commit, push, and open the draft PR. This keeps the issue history in one final commit unless the worker intentionally committed earlier implementation checkpoints.

---

## Step 9 — What's next

After reporting the verdict and completing any fixes or verification, tell the user explicitly which of these applies:

- **READY TO FINISH, no uncommitted changes** → "Run `/wivwav-finish-issue` to validate, push if needed, and open the draft PR."
- **READY TO FINISH, review fixes left uncommitted** → "Run `/wivwav-finish-issue {N}` to run final validation, commit, push, and open the draft PR."
- **REVISION NEEDED, fixes applied and selective re-review passed** → "Run `/wivwav-finish-issue {N}` to validate, commit, push, and open the draft PR."
- **REVISION NEEDED, fixes applied but issues remain after two cycles** → "Manual review needed — the remaining findings are listed above. Fix them, then run `/wivwav-code-review {N}` for a fresh pass."
- **REVISION NEEDED, fixes not yet applied** → "Apply the remaining fixes listed above, then re-run `/wivwav-code-review {N}`."
