---
description: Run the WAVSearch review pipeline against actual changed files. Auto-detects change type and routes to the matching pipeline — only the relevant sub-agents run. Use after implementation, before /finish-issue.
argument-hint: "[issue-number]"
---

# Review Pipeline

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

## Step 3 — Run the pipeline for the detected type

Jump to the matching section below. Each sub-agent prompt follows this template:

```
Read `.claude/core.md` for project context.
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

1. **content-reviewer** — grammar, clarity, consistent voice, factual accuracy, tone for WAVSearch audience (wheelchair accessible vehicle buyers and caregivers)
2. **qa** (`.claude/roles/qa.md`) — acceptance criteria coverage

---

### Pipeline: mixed

*Triggered when files from more than one type changed in the same commit.*

Build the sub-agent list as the **union** of the matching individual pipelines — deduped. `reviewer` and `qa` run once even if multiple pipeline types match.

Example: `apps/web/` changes + `.md` changes → web + docs → reviewer (once) + accessibility + tester + docs-accuracy + qa (once).

---

## Step 4 — Collect results and report

After all sub-agents complete:

- **Overall verdict**:
  - Any `REVISION_NEEDED: yes` → **REVISION NEEDED**
  - All `REVISION_NEEDED: no` → **READY TO FINISH**

- Report findings grouped by sub-agent, numbered, labeled [CRITICAL] / [WARNING] / [SUGGESTION].
- If REVISION NEEDED: a prioritized fix list — [CRITICAL] first, then [WARNING].
