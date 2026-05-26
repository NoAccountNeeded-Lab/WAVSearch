---
applyTo: '**'
---

# SDLC Instructions

Use GitHub issues, labels, pull requests, and checks as the shared workflow state.

Before implementation:

- Confirm the issue number.
- Check acceptance criteria.
- Identify whether design, accessibility, QA, or release notes are required.

During implementation:

- Keep commits scoped.
- Reference the issue in commits and PR body.
- Do not mix unrelated features in one PR.

Before merge:

- CI must pass.
- Code review must pass.
- Accessibility review must pass for user-facing changes.
- QA notes must be present.
- Release and rollback notes must be present when deployment behavior changes.
