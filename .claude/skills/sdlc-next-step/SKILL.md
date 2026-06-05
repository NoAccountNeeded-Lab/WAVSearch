---
description: Guide a human through the next WAVSearch SDLC step. Use when work is blocked, complete, ambiguous, ready for validation, ready for review, or when the user asks what to do next.
argument-hint: "[current-state]"
---

# SDLC Next Step

Use this skill whenever the human needs to choose the next SDLC action or when the agent is about to stop after meaningful work.

Read `.claude/core.md` first and infer the current state from the branch, issue, PR, validation results, and working tree. Read `AGENTS.md` only if the task requires deep workflow, architecture, or API route reference that is not in `core.md`.

Respond with:

1. A one-sentence current state.
2. Two to four concrete options.
3. Exactly one **Recommended** option when there is a clear safest next step.
4. The exact slash command or action name when one exists.

Common options:

- "Run `/finish-issue` now. **Recommended** — validates, commits, pushes, and opens the draft PR."
- "Run `/code-review` now. **Recommended** after the draft PR exists."
- "Investigate and fix the validation failure."
- "Implement option A or option B."
- "Pause here and leave the branch uncommitted."

At session start, if the user asks for implementation work without an issue or branch, offer a course correction:

- "Pick an existing issue and start the issue workflow. **Recommended**"
- "Create a new issue for this task, then start work."
- "Keep this as discussion/planning only and do not edit code."

Do not perform commit, push, PR creation, merge, destructive cleanup, or broad implementation direction changes unless the user chooses that option or has already explicitly requested it.
