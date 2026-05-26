#!/usr/bin/env bash
# setup-sdlc-vars.sh — Stamps SDLC pipeline variables into the GitHub repo.
#
# Sets all AGENTS_* repo variables to their default placeholder values.
# With no API key secrets configured, the pipeline runs in plain-text fallback
# mode (no AI summaries, but fully functional QA pass/fail and label flipping).
#
# Prerequisites:
#   - GitHub CLI installed and authenticated: gh auth status
#   - Repo write access
#
# Usage:
#   bash scripts/setup-sdlc-vars.sh
#
# To enable AI later, add the matching secret in GitHub Settings and optionally
# update AGENTS_PROVIDER. See .github/SDLC.md for full options.

set -euo pipefail

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")

if [[ -z "$REPO" ]]; then
  echo "❌  Could not detect repo. Run this from inside the cloned repository." >&2
  exit 1
fi

echo "📦  Setting SDLC variables for ${REPO}"
echo "    Provider: 'github' — uses GITHUB_TOKEN (auto-provided in Actions, no setup needed)."
echo "    See .github/SDLC.md for all provider options."
echo ""

# ── Core provider selection ───────────────────────────────────────────────────
# Default to 'github' (GitHub Models API). Uses the GITHUB_TOKEN that is
# already auto-provided in every GitHub Actions run — no secrets to configure.
# Free tier is rate-limited (~150 requests/day) which is fine for a normal
# PR pipeline. Switch to 'anthropic' or 'openai' for higher throughput.
gh variable set AGENTS_PROVIDER --body "github" --repo "$REPO"
echo "✅  AGENTS_PROVIDER = github"

# ── Model overrides (these match the hardcoded defaults in ai_client.py) ──────
# Explicitly setting them here makes them visible in GitHub Settings and easy
# to change without touching code.

gh variable set AGENTS_GITHUB_MODEL --body "gpt-4o-mini" --repo "$REPO"
echo "✅  AGENTS_GITHUB_MODEL = gpt-4o-mini"

gh variable set AGENTS_ANTHROPIC_MODEL --body "claude-haiku-4-5-20251001" --repo "$REPO"
echo "✅  AGENTS_ANTHROPIC_MODEL = claude-haiku-4-5-20251001"

gh variable set AGENTS_OPENAI_MODEL --body "gpt-4o-mini" --repo "$REPO"
echo "✅  AGENTS_OPENAI_MODEL = gpt-4o-mini"

gh variable set AGENTS_OLLAMA_MODEL --body "qwen2.5-coder:7b" --repo "$REPO"
echo "✅  AGENTS_OLLAMA_MODEL = qwen2.5-coder:7b"

gh variable set AGENTS_OLLAMA_BASE_URL --body "http://localhost:11434" --repo "$REPO"
echo "✅  AGENTS_OLLAMA_BASE_URL = http://localhost:11434"

echo ""
echo "🎉  Done. Pipeline is active with GitHub Models (free, no API key needed)."
echo ""
echo "Next steps:"
echo "  • Nothing required — GitHub Models works immediately with Copilot on your org."
echo "  • To use Claude: set AGENTS_PROVIDER=anthropic and add ANTHROPIC_API_KEY secret"
echo "  • To use Ollama: set AGENTS_PROVIDER=ollama and point AGENTS_OLLAMA_BASE_URL"
echo "    at your Ollama server (self-hosted runner required)"
echo "  • Full reference: .github/SDLC.md"
