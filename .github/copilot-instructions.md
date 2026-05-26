# Repository Instructions

WAV Search is a TypeScript monorepo for wheelchair accessible vehicle search.

Core rules:

- Keep work issue-driven. PRs must link an issue.
- Preserve API-first boundaries. The web app calls the API; it does not read the DB directly.
- Keep dependencies swappable behind interfaces.
- Use mobile-first UI and WCAG 2.1 AA accessibility.
- Runtime dependencies must use permissive licenses: MIT, Apache 2.0, BSD, or PostgreSQL License. Do not add GPL or AGPL runtime dependencies.
- Use strict TypeScript and ESM imports with `.js` extensions for local package imports.
- Add focused tests for risky behavior.
- Do not commit `.env` files, secrets, generated cache files, or unrelated formatting churn.

Review priorities:

1. Correctness bugs and regressions.
2. Security and data exposure.
3. Accessibility failures.
4. API/data contract drift.
5. Missing tests for changed behavior.
