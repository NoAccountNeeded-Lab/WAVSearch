# Claude Instructions

## For all Claude Code sessions

Read `.claude/core.md` — it is the lean agent context (project overview, principles, commit format, attribution format). It replaces reading all of AGENTS.md for most tasks.

Then read your role file: `.claude/roles/{your-role}.md`
- Working on an issue? → `.claude/roles/worker.md`
- Reviewing code? → `.claude/roles/reviewer.md`
- Reviewing docs? → `.claude/roles/docs-accuracy.md`
- Not sure? → read `.claude/core.md` and continue

If you need deep reference (API routes, data model, ops workflows, scraper architecture), read `AGENTS.md`. It is the comprehensive human-facing project guide.

## Claude-specific behavior

If a Claude-specific instruction conflicts with `AGENTS.md` only because of Claude tooling or slash command behavior, use the Claude-specific instruction. Otherwise `AGENTS.md` is the source of truth for architecture, workflow, testing, and commit expectations.

Skills live in `.claude/skills/`. Run them with the `/skill-name` slash command.
