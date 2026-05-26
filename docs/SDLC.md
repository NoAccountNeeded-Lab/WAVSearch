# AI-Agnostic SDLC

This repo uses GitHub as the shared control plane for human and AI agents. Agents can be Claude, OpenAI, Copilot/GitHub Models, Ollama, or another provider, but the workflow state lives in issues, pull requests, labels, checks, and deployment records.

## Goals

- Keep work issue-driven and reviewable.
- Let agents pick up assigned work first, then unassigned ready work.
- Require code review, accessibility review, QA, and release notes before publish.
- Keep provider-specific AI tools optional so we are not locked into one vendor.
- Make designer-owned style and brand guidance part of the engineering contract.

## Roles

| Role                   | Primary responsibility                                                            | Required output                                               |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Product owner          | Defines user value, priority, acceptance criteria                                 | Issue with clear scope and success criteria                   |
| Designer               | Owns brand, visual language, interaction patterns, and reusable style guidance    | Design notes, tokens, screenshots, or `docs/BRAND.md` updates |
| Developer agent        | Builds the change from an assigned or selected issue                              | Branch, commits, draft PR, test evidence                      |
| Code reviewer          | Reviews correctness, maintainability, security, and architecture                  | PR review comments or `status:needs-qa`                       |
| Accessibility reviewer | Reviews WCAG 2.1 AA, keyboard, screen reader, contrast, motion, and mobile access | PR review comments or `status:needs-qa`                       |
| QA agent               | Verifies acceptance criteria in the running app                                   | QA checklist and `status:qa-passed` or `status:qa-failed`     |
| Release manager        | Publishes approved work and checks production health                              | Deployment record, rollback notes, smoke test result          |

The local `packages/agents` pipeline mirrors these lanes with provider-agnostic roles: planner, architect, coder, reviewer, accessibility, tester, qa, docs, and release.

## Issue Intake

Every work item starts as a GitHub issue. It should include:

- Problem or user need.
- Acceptance criteria.
- Affected areas: web, api, scraper, data, infra, docs, accessibility, design.
- Required manual QA.
- Accessibility expectations for user-facing work.

Agents follow this startup loop:

1. Query open issues assigned to the agent and without a terminal status.
2. If none are assigned, query open unassigned issues labeled `status:ready`.
3. Pick the highest-priority issue the agent role can handle.
4. Comment a short check-in with the issue selected, role, provider, and intended first step.
5. Add `status:in-progress`.
6. Create a branch named `type/issue-{N}-{short-slug}`.

## Status Labels

| Label                  | Meaning                                |
| ---------------------- | -------------------------------------- |
| `status:ready`         | Ready for an agent or human to pick up |
| `status:in-progress`   | Someone is actively working            |
| `status:needs-review`  | PR is ready for code review            |
| `status:needs-changes` | Review found required changes          |
| `status:needs-qa`      | Code and accessibility review passed   |
| `status:qa-failed`     | QA found a blocking problem            |
| `status:qa-passed`     | Ready for owner review and merge       |
| `status:stuck`         | Human input required                   |

Role labels identify the next responsible lane: `agent:developer`, `agent:accessibility`, `agent:qa`, `agent:designer`, and `agent:release`.

## Pull Request Flow

1. Developer opens a draft PR from the issue branch.
2. CI runs typecheck, lint, and tests.
3. Developer fills the PR checklist and links the issue.
4. PR is marked ready and labeled `status:needs-review`.
5. Code review runs. Use GitHub Copilot code review where available, plus a provider-agnostic agent review when needed.
6. Accessibility review runs for user-facing changes.
7. Passing review moves the PR to `status:needs-qa`.
8. QA verifies acceptance criteria and marks `status:qa-passed` or `status:qa-failed`.
9. Owner merges.
10. Publish workflow deploys from `main`.
11. Release manager performs smoke checks and comments results.

## Required Gates

Required for all PRs:

- Linked issue.
- CI success.
- Code review completed.
- Tests or explicit test-gap explanation.
- QA notes.

Required for user-facing PRs:

- Accessibility checklist completed.
- Keyboard navigation considered.
- Screen reader semantics considered.
- Color contrast checked.
- Mobile viewport checked.

Required before publish:

- Merged to `main`.
- Build succeeds.
- Docker images build.
- Release notes include rollback and smoke checks.

## AI Provider Strategy

Provider choice is runtime configuration, not workflow logic:

- `AGENTS_PROVIDER=anthropic` for Claude.
- `AGENTS_PROVIDER=openai` for OpenAI API.
- `AGENTS_PROVIDER=copilot` for GitHub Models/Copilot-compatible endpoints.
- `AGENTS_PROVIDER=ollama` for local models.

Provider-specific tools can improve the flow, but GitHub remains the source of truth. If one provider is unavailable, another can continue from the issue, PR, labels, and docs.

## Copilot Code Review

GitHub Copilot code review should be enabled as an optional PR reviewer when available. It is useful as a baseline reviewer, but it does not replace:

- Project-specific architecture review.
- Accessibility review.
- Manual QA.
- Owner approval.

Copilot custom instructions live in `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`.

## Designer-Owned Standards

Designer guidance belongs in `docs/BRAND.md` and should be treated as source code:

- Visual principles.
- Color, type, spacing, and interaction rules.
- Component usage rules.
- Accessibility constraints.
- Examples of approved and rejected patterns.

Developers and agents must check the brand guide before user-facing UI changes.

## Current MVP

This repository now has the scaffolding for the SDLC:

- Agent role prompts in `packages/agents`.
- Issue and PR templates.
- GitHub Actions for CI, SDLC gates, agent intake, and publish.
- Copilot instruction files.
- Brand and accessibility guidance docs.

The next step is wiring real hosted agents to the `agent-intake` workflow, then deciding which providers get access to repository secrets.
