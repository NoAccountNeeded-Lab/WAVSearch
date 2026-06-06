# CI Sprint Safety Controls

Design document for running `/wav-run-sprint` non-interactively via GitHub Actions.

Refs #165, unblocks #164.

---

## Decision summary

| Concern | Decision |
| ------- | -------- |
| Permission model | `--allowedTools` explicit allowlist — no `--dangerously-skip-permissions` |
| Runner | Self-hosted (local machine or controlled server) |
| GitHub token scopes | `contents: write` + `pull-requests: write` + `issues: write` |
| Ephemeral isolation | Worktree per worker (already built into `/wav-run-sprint`) |
| Audit trail | GitHub Actions logs + structured issue comments from the worker |
| Blast radius cap | Branch protection on `main`; all work lands as draft PRs requiring human review |

---

## 1. Tool scope

The CI sprint does **not** use `--dangerously-skip-permissions`.

Instead, the `claude` invocation passes an explicit `--allowedTools` allowlist that covers everything the worker legitimately needs:

```
Bash,Read,Write,Edit,Agent,Skill
```

Rationale for each tool:

| Tool | Why needed |
| ---- | ---------- |
| `Bash` | git commands, pnpm test/lint/typecheck, gh CLI (branch, PR, issue) |
| `Read` | Read source files, AGENTS.md, issue bodies |
| `Write` | Create new source files and test files |
| `Edit` | Modify existing source files |
| `Agent` | Spawn sub-agents for `/wav-review-pipeline` roles |
| `Skill` | Invoke `/wav-review-pipeline` and `/wav-finish-issue` |

Tools explicitly excluded (not needed for sprint work):

- `WebFetch` / `WebSearch` — workers read the codebase, not the web
- `mcp__*` — no MCP servers are available on the CI runner
- `NotebookEdit` / `RemoteTrigger` / `CronCreate` — not relevant to coding tasks

This approach is strictly safer than `--dangerously-skip-permissions`: the tool list is auditable,
reviewable, and the same constraint holds even if Claude Code's internal permission model changes.

---

## 2. Runner isolation

### Self-hosted runner (required)

The workflow runs on a self-hosted runner tagged `self-hosted`. This is a hard requirement because:

- The runner must have `claude` CLI installed and authenticated to a Claude subscription.
- GitHub's hosted (`ubuntu-latest`) runners are ephemeral VMs with no Claude Code auth.
- No `ANTHROPIC_API_KEY` is needed — the worker uses Claude Code's existing subscription auth.

See [GitHub docs: self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners).

### Filesystem scope

Each sprint worker creates a git worktree under `.claude/worktrees/` (standard `/wav-run-sprint`
behaviour). This keeps the main working tree clean and limits file writes to:

- The worktree checkout (project files only)
- GitHub API calls via `gh` (branches, PRs, issue comments)

The runner does not have access to production secrets, databases, or deployment infrastructure.
The only secret available to the workflow is `GITHUB_TOKEN`, which is repository-scoped.

### GitHub token scopes

The workflow uses the default `GITHUB_TOKEN` with only the permissions it needs:

```yaml
permissions:
  contents: write        # push feature branches
  pull-requests: write   # open draft PRs
  issues: write          # add/remove labels, post comments
```

No `packages`, `deployments`, `actions`, or other scopes are granted.

### Ephemeral worktrees

Each worker creates a fresh worktree branched from the latest `main`. There is no shared
mutable checkout state between workers. The worker worktree is removed after that worker completes
(or on the next run startup as part of the existing worktree cleanup logic).

---

## 3. Audit trail

Two layers of audit are in place without additional instrumentation:

1. **GitHub Actions logs** — every command run by the workflow, including all Claude Code
   stdout/stderr, is captured and retained for 90 days by default. This covers the full worker
   transcript, including every file it touched and every decision it made.

2. **Structured issue comments** — the `/wav-run-sprint` skill posts the branch name and worker index at start, and
   the worker posts its PR URL + commit SHA on success (or a failure reason on error). These
   comments are permanent and visible to anyone with repo access.

Together these provide: what ran, when, what it produced, and what went wrong — without any custom
logging infrastructure.

---

## 4. Failure blast radius

| Failure mode | Likelihood | Mitigation |
| ------------ | ---------- | ---------- |
| Worker pushes junk commits to a branch | Possible | `main` branch protection requires PR review — direct pushes blocked. Junk stays on a feature branch until a human reviews and merges (or closes) the draft PR. |
| Worker opens a PR with broken code | Possible | All PRs open as **drafts**. CI (typecheck + lint + test) runs on every PR and must pass before the PR can be merged. Drafts cannot be auto-merged. |
| Worker modifies unrelated files | Rare | Every draft PR is reviewed by a human before merging. Diffs are fully visible in the PR. |
| Worker comment-spams issues | Rare | The `/wav-run-sprint` skill structure produces at most two comments per issue: a start comment and a completion comment. |
| Runner exfiltrates secrets | Low | `GITHUB_TOKEN` is the only secret. It is repository-scoped and expires when the run ends. The `--allowedTools` list excludes all network-read tools (`WebFetch`, `mcp__*`). |
| Worker gets stuck in a loop | Possible | `/wav-run-sprint` spawns one `Agent` call per issue — sub-agents cannot re-spawn themselves. The GitHub Actions job-level timeout (default 6 h, set to 2 h in the workflow) bounds the worst case. |
| Two runs claim the same ready issue | Possible | Automatic no-argument runs are serialized with the `sprint-auto` concurrency group. Explicit issue-list runs can run concurrently, but callers must not submit overlapping issue numbers. |

### Already-in-place safeguards

- `main` branch protection (PR review required) — enforced at the GitHub repo level
- Draft PR gate — all worker PRs start as drafts, blocking auto-merge
- CI gate — typecheck + lint + test must pass before a PR is mergeable
- `--allowedTools` allowlist — restricts what Claude can do without any human approval prompt
- Minimal `GITHUB_TOKEN` scopes — no deployment, package, or admin access

No additional safeguards are required before committing the workflow.

---

## 5. Alternatives considered

### Alternative A: `--dangerously-skip-permissions`

Rejected. Disabling all permission checks is a wider blast radius than needed. The `--allowedTools`
allowlist achieves the same non-interactive flow with a narrower, auditable scope. There is no
benefit to `--dangerously-skip-permissions` that the allowlist does not also provide for this use case.

### Alternative B: Docker container with restricted filesystem

Considered. Would provide stronger filesystem isolation (worker cannot reach paths outside
`/workspace`). The added operational complexity — building and maintaining a container image with
Claude Code and subscription auth — is not justified given:

- The self-hosted runner already runs on a machine the operator controls.
- The `--allowedTools` allowlist limits what Claude can do even with full filesystem access.
- Worktrees already scope git operations to a clean subdirectory.

Can be revisited if the runner is moved to a shared or multi-tenant server.

### Alternative C: CI-specific `.claude/settings.json` profile

Considered. A separate settings file that pre-approves a set of commands would work but is harder
to read and audit than an explicit CLI flag. The `--allowedTools` flag is self-documenting in the
workflow YAML and does not require knowledge of the settings file format.

---

## 6. Implementation

See `.github/workflows/run-sprint.yml` — added alongside this document.

The workflow:
- Triggers: `workflow_dispatch`, `schedule` (weekdays 9 AM UTC), `repository_dispatch`
- Optional issue list: `workflow_dispatch` input or `repository_dispatch.client_payload.issue_numbers`, formatted as a space-delimited list such as `123 221 234`
- Runner: `self-hosted`
- Token permissions: `contents: write`, `pull-requests: write`, `issues: write`
- Invocation: `claude --allowedTools "Bash,Read,Write,Edit,Agent,Skill" -p "/wav-run-sprint [issue numbers]"`
- Job timeout: 120 minutes (bounds stuck-worker blast radius)
