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
echo "    Provider will be 'anthropic' — no API key set = plain-text fallback mode."
echo "    See .github/SDLC.md to enable AI when you're ready."
echo ""

# ── Core provider selection ───────────────────────────────────────────────────
# Set to 'anthropic' as the default. Without ANTHROPIC_API_KEY secret, all
# agents run in plain-text fallback mode — no AI, no cost, fully functional.
gh variable set AGENTS_PROVIDER --body "anthropic" --repo "$REPO"
echo "✅  AGENTS_PROVIDER = anthropic"

# ── Model overrides (these match the hardcoded defaults in ai_client.py) ──────
# Explicitly setting them here makes them visible in GitHub Settings and easy
# to edit without touching code.

gh variable set AGENTS_ANTHROPIC_MODEL --body "claude-haiku-4-5-20251001" --repo "$REPO"
echo "✅  AGENTS_ANTHROPIC_MODEL = claude-haiku-4-5-20251001"

gh variable set AGENTS_OPENAI_MODEL --body "gpt-4o-mini" --repo "$REPO"
echo "✅  AGENTS_OPENAI_MODEL = gpt-4o-mini"

gh variable set AGENTS_OLLAMA_MODEL --body "qwen2.5-coder:7b" --repo "$REPO"
echo "✅  AGENTS_OLLAMA_MODEL = qwen2.5-coder:7b"

gh variable set AGENTS_OLLAMA_BASE_URL --body "http://localhost:11434" --repo "$REPO"
echo "✅  AGENTS_OLLAMA_BASE_URL = http://localhost:11434"

echo ""
echo "🎉  Done. Pipeline is active in plain-text fallback mode."
echo ""
echo "Next steps:"
echo "  • To enable AI:  add ANTHROPIC_API_KEY (or OPENAI_API_KEY) in"
echo "    GitHub → Settings → Secrets and variables → Actions → Secrets"
echo "  • To use Ollama: set AGENTS_PROVIDER=ollama and point"
echo "    AGENTS_OLLAMA_BASE_URL at your Ollama server"
echo "  • Full reference: .github/SDLC.md"
