# WAVSearch SDLC — Configuration Reference

The GitHub Actions SDLC pipeline is provider-agnostic. You can run it with Claude, OpenAI,
a local Ollama model, or **no AI at all** (plain-text fallback mode). This document covers
every variable and secret the pipeline reads.

---

## Quick start — AI enabled, zero configuration

The default provider is `github`, which uses the **GitHub Models API** authenticated with
`GITHUB_TOKEN`. That token is auto-provided by GitHub Actions in every workflow run —
no secrets, no variables, nothing to configure. With Copilot active on your organisation
you get real AI summaries immediately after merging the SDLC branch.

**Free tier limits:** ~150 requests/day per model. More than enough for a normal PR pipeline.

### Fallback (no AI)

If `GH_TOKEN` is somehow absent, or you explicitly set a different provider without
adding its key, all three agents fall back to plain-text output:

- **Code Review** posts a "Manual Review Needed" comment; a human applies the next label.
- **QA Agent** posts a bullet-list failure report (or `✅ QA Passed`) without an AI summary.
- **Rework Advisor** posts a generic checklist without AI prioritisation.

Everything still works — it's just less detailed.

---

## Repository Variables (`vars.*`)

Set these in **GitHub → Settings → Secrets and variables → Actions → Variables**.

| Variable | Default (if unset) | Purpose |
|---|---|---|
| `AGENTS_PROVIDER` | `github` | Which AI backend to use: `github` \| `anthropic` \| `openai` \| `ollama` |
| `AGENTS_GITHUB_MODEL` | `gpt-4o-mini` | GitHub Models model name (only used when `AGENTS_PROVIDER=github`) |
| `AGENTS_ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Anthropic model name (only used when `AGENTS_PROVIDER=anthropic`) |
| `AGENTS_OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model name (only used when `AGENTS_PROVIDER=openai`) |
| `AGENTS_OLLAMA_MODEL` | `qwen2.5-coder:7b` | Ollama model tag (only used when `AGENTS_PROVIDER=ollama`) |
| `AGENTS_OLLAMA_BASE_URL` | `http://localhost:11434` | Base URL of the Ollama server (only used when `AGENTS_PROVIDER=ollama`) |

> Variables are optional — every one has a hardcoded default in
> `.github/scripts/ai_client.py`. Only set a variable when you want to override the default.

---

## Repository Secrets (`secrets.*`)

Set these in **GitHub → Settings → Secrets and variables → Actions → Secrets**.

| Secret | Required when | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `AGENTS_PROVIDER=anthropic` | If absent, all agents run in plain-text fallback mode |
| `OPENAI_API_KEY` | `AGENTS_PROVIDER=openai` | If absent, all agents run in plain-text fallback mode |
| `GITHUB_TOKEN` | Always | Auto-provided by GitHub Actions — **do not add this manually** |

Secrets for providers you are **not** using can be left unset.

---

## Provider setup examples

### Option A — GitHub Models (free, default ✓)

No secrets needed. `GITHUB_TOKEN` is auto-provided by Actions in every run.
Requires Copilot to be enabled on your GitHub account or organisation.

```
# Nothing to configure — works immediately after merging the SDLC branch.
# AGENTS_PROVIDER defaults to 'github'.
```

To upgrade the model (all available on GitHub Models free tier):

```
AGENTS_GITHUB_MODEL = gpt-4o          # more capable, same cost
AGENTS_GITHUB_MODEL = claude-sonnet-4  # Anthropic via GitHub Models
```

### Option B — Anthropic (Claude)

```
# GitHub → Settings → Secrets
ANTHROPIC_API_KEY = sk-ant-...

# GitHub → Settings → Variables (optional — these are already the defaults)
AGENTS_PROVIDER            = anthropic
AGENTS_ANTHROPIC_MODEL     = claude-haiku-4-5-20251001
```

Recommended model upgrade (better reasoning, modest cost increase):

```
AGENTS_ANTHROPIC_MODEL = claude-sonnet-4-5
```

### Option C — OpenAI

```
# GitHub → Settings → Secrets
OPENAI_API_KEY = sk-...

# GitHub → Settings → Variables
AGENTS_PROVIDER        = openai
AGENTS_OPENAI_MODEL    = gpt-4o-mini   # or gpt-4o for higher quality
```

### Option D — Ollama (local, free after setup)

Requires a self-hosted GitHub Actions runner on the same machine as Ollama,
or Ollama exposed via Tailscale/ngrok.

```bash
# One-time local setup
brew install ollama
ollama pull qwen2.5-coder:7b   # ~4 GB

# Start Ollama server
ollama serve
```

```
# GitHub → Settings → Variables
AGENTS_PROVIDER          = ollama
AGENTS_OLLAMA_MODEL      = qwen2.5-coder:7b
AGENTS_OLLAMA_BASE_URL   = http://<your-runner-ip>:11434
```

---

## Switching providers

Change `AGENTS_PROVIDER` in repo variables at any time — no code changes needed.
The three scripts (`code_review.py`, `qa.py`, `rework.py`) all route through
`.github/scripts/ai_client.py`, which reads the variable on every run.

---

## Pipeline label state machine

```
Issue opened
    ↓  (agent-intake.yml)
status:ready
    ↓  (developer picks up issue — manual or Claude Code session)
PR opened → status:needs-review
    ↓  (code-review.yml — GitHub cloud runner)
status:needs-changes
    ↓  (developer-agent.yml — self-hosted Mac runner)
    ├─ fixes applied + tests pass  ──→ status:needs-review  (loops back to review)
    └─ cannot fix / tests fail     ──→ status:stuck         (human required)
status:needs-qa
    ↓  (qa.yml — GitHub cloud runner)
status:qa-failed ──→ status:needs-review  (rework.yml posts fix plan, human re-labels)
status:qa-passed
    ↓
Human reviews → merges PR
```

Every label has exactly one owner. `status:stuck` is the safe escalation path —
it always requires a human to look at the PR and decide what to do.

---

## Developer Agent (self-hosted runner)

The developer agent is the only part of the pipeline that runs on **your Mac**. It
needs access to tools already installed locally — it doesn't pay for cloud compute or
extra API keys.

### How it works

When `status:needs-changes` is applied to a PR, `developer-agent.yml` wakes up on
your Mac runner and:

1. Checks out the PR branch
2. Reads the blocking findings from the most recent SDLC code review comment
3. Runs **Claude Code CLI** (`claude --dangerously-skip-permissions -p "..."`) — uses
   your existing `claude auth login` session, **no API key, no extra cost**
4. Falls back to **Ollama** patch generation if Claude Code is not available
5. Runs `pnpm test --run` and `pnpm typecheck` to verify the fixes
6. If both pass: commits the fixes and re-labels to `status:needs-review`
7. If either fails: reverts all changes and labels `status:stuck`

**Loop guard:** if the last commit on the branch was already made by the bot, it
escalates to `status:stuck` immediately rather than retrying indefinitely.

**Runner offline:** if your Mac is off or the runner is stopped, the job queues
in GitHub Actions and runs automatically when the Mac comes back online.

### One-time setup

```bash
bash scripts/setup-runner.sh
```

This script:
- Downloads the GitHub Actions runner for your Mac (ARM64 or x64 auto-detected)
- Registers it with the repo using a fresh token from `gh api`
- Installs it as a launchd user service so it starts automatically on login
- Checks that `claude`, `ollama`, `pnpm`, `node`, `gh`, and `python3` are present

Run it once after merging this branch. Re-run it any time to check the setup or
after a long break to re-register the runner (tokens expire but the service persists).

### Runner management

```bash
cd ~/actions-runner
./svc.sh status     # check if running
./svc.sh stop       # stop the service
./svc.sh start      # start the service
./svc.sh uninstall  # remove the launchd service
./config.sh remove  # deregister from GitHub (run after uninstall)
```

Logs are in `~/actions-runner/_diag/`.

### What the developer agent can and cannot fix

**Works well:**
- Adding missing `try/catch` around API calls
- Fixing null checks and missing type guards
- Adding missing `aria-label` / `alt` attributes
- Fixing a wrong conditional or off-by-one error
- Validating env vars before use

**Escalates to `status:stuck`:**
- Multi-file architectural refactors
- Changes requiring a live database (Prisma migrations)
- Cascading caller changes across many files
- Anything where tests fail and the root cause is unclear

---

## Initial setup checklist (after merging this branch)

Run these in order once. They only need to be done once — the pipeline is self-sustaining after that.

```bash
# 1. Stamp repo variables (sets AGENTS_PROVIDER=github and all model defaults)
bash scripts/setup-sdlc-vars.sh

# 2. Set up the self-hosted runner on your Mac (enables the developer agent)
bash scripts/setup-runner.sh

# 3. Verify Claude Code is authenticated (used by the developer agent)
claude auth status
```

That's it. From here the full pipeline is active:
- Code review → GitHub Models (free, cloud)
- QA agent → GitHub Actions (free, cloud)
- Rework advisor → GitHub Models (free, cloud)
- Developer agent → Claude Code on your Mac (free, uses $20/month subscription)
