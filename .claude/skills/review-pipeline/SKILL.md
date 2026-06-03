---
description: Run the WAVSearch review pipeline against actual changed files. Partitions files into typed buckets, dispatches each bucket to the right sub-agents in parallel (each reads its role file), then gathers all findings into a single verdict.
argument-hint: "[issue-number]"
---

# Review Pipeline

**Pattern: Scatter-Gather with Message Partitioning**

Partition changed files → dispatch each bucket to domain-appropriate sub-agents in parallel → gather findings into one verdict. Each sub-agent reads its own role file in `.claude/roles/` for instructions.

---

## Step 1 — Get changed files

```bash
git diff --name-only HEAD
git diff --name-only --cached
git ls-files --others --exclude-standard
```

If all three return nothing (changes are committed), fall back to:
```bash
git diff origin/main...HEAD --name-only
```

Combine results. Exclude `.env`, `node_modules`, `dist`, generated Prisma output.

---

## Step 2 — Partition into buckets

| Bucket      | File patterns                                               |
| ----------- | ----------------------------------------------------------- |
| **web**     | Any file under `apps/web/`                                  |
| **code**    | `.ts` / `.tsx` outside `apps/web/`                         |
| **docs**    | `.md`, `SKILL.md`, files under `.claude/`                  |
| **config**  | `.json`, `.yaml`, `.yml`, `.sh`, `Dockerfile*`, `Makefile` |
| **content** | Files under `content/`, `blog/`, `posts/` *(future)*      |

A file goes in exactly one bucket.

---

## Step 3 — Build the job list

| Sub-agent          | Role file                            | Receives                          | Runs when                          |
| ------------------ | ------------------------------------ | --------------------------------- | ---------------------------------- |
| **reviewer**       | `.claude/roles/reviewer.md`          | code + web + config files         | any of those buckets non-empty     |
| **accessibility**  | `.claude/roles/accessibility.md`     | web files only                    | web bucket non-empty               |
| **tester**         | `.claude/roles/tester.md`            | code + web TypeScript files       | code or web bucket non-empty       |
| **docs-accuracy**  | `.claude/roles/docs-accuracy.md`     | docs files only                   | docs bucket non-empty              |
| **content**        | `.claude/roles/content.md`           | content files only                | content bucket non-empty           |
| **qa**             | `.claude/roles/qa.md`                | all changed files + issue body    | always                             |

`reviewer` and `qa` appear once regardless of how many buckets matched.

---

## Step 4 — Spawn all jobs in parallel

For each job, use this prompt template (fill in role name, scoped file list, issue number):

```
Read `.claude/core.md` for project context.
Read `.claude/roles/{role}.md` for your role instructions and output contract.

Issue number: {N}
Your scoped file list: {files for this job}

Use your Read tool to read each file before reviewing.
Use Bash to run `git diff origin/main -- {file}` to see what changed.
Follow the output format defined in your role file exactly.
```

For the **qa** sub-agent, also include:
```
Issue title and description:
{output of: gh issue view N --json title,body}
```

For the **tester** sub-agent, also include:
```
Write any missing tests directly to disk using your Write/Edit tools.
```

---

## Step 5 — Gather results and report

After all sub-agents complete:

- **Overall verdict**:
  - Any `REVISION_NEEDED: yes` → **REVISION NEEDED**
  - All `REVISION_NEEDED: no` → **READY TO FINISH**

- Report findings grouped by role, numbered, labeled [CRITICAL] / [WARNING] / [SUGGESTION].
- If REVISION NEEDED: prioritized fix list — [CRITICAL] first, then [WARNING].

---

## Adding a new pipeline type

1. Add a row to the bucket table in Step 2.
2. Add a row to the job table in Step 3.
3. Create `.claude/roles/{new-role}.md` with frontmatter + instructions.

No changes to this skill file needed — the prompt template in Step 4 is generic.
