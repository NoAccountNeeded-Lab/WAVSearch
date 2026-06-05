# WAVSearch Claude Code Context

Start with `.claude/core.md`, then read the role file or skill for the active task.

Common role files:

- Working on an issue: `.claude/roles/worker.md`
- Reviewing code: `.claude/roles/reviewer.md`
- Reviewing docs: `.claude/roles/docs-accuracy.md`
- Testing: `.claude/roles/tester.md`
- QA: `.claude/roles/qa.md`

Use `AGENTS.md` as deep reference only when the task needs details that are not in `.claude/core.md`, such as API route tables, data model notes, ops workflows, or schema rules. The file is intentionally longer and should not be read speculatively.

For implementation work, follow the issue workflow: mark the issue `status:in-progress`, branch from latest `main`, plan before file reads, run focused verification, then use `/wav-finish-issue` when ready to commit and open a draft PR.

When reading context, prefer targeted `rg` searches and narrow file ranges over broad exploratory reads. If a task touches `apps/web`, read `docs/BRAND.md` before UI edits.

Skills live in `.claude/skills/` and run through their slash commands.
