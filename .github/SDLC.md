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
    ↓  (code-review.yml)
status:needs-changes ──→ status:needs-review  (after rework)
    ↓                        ↑
status:needs-qa          rework.yml fires on needs-changes
    ↓  (qa.yml)
status:qa-failed ──→ status:needs-review  (after rework)
    ↓                   ↑
status:qa-passed    rework.yml fires on qa-failed
    ↓
Human reviews → merges PR
```

Every label has exactly one workflow that owns it — no dead ends.

---

## Running the setup script

`scripts/setup-sdlc-vars.sh` stamps all variables into the repo with safe placeholder
defaults (no AI mode). Run it once after merging the SDLC branch:

```bash
bash scripts/setup-sdlc-vars.sh
```

It uses `gh variable set` and requires the GitHub CLI authenticated with repo write access.
It never touches secrets — add those manually in GitHub Settings when you're ready to enable AI.
