#!/usr/bin/env bash
# setup-runner.sh — One-time setup for the WivWav self-hosted GitHub Actions runner.
#
# Run this once on your Mac to enable the AI Developer Agent. The runner:
#   - Runs as YOUR user account (so it has access to your Claude Code login)
#   - Starts automatically when you log in (launchd user service)
#   - Uses tools already on your Mac: Claude Code, Ollama, pnpm, node, gh
#   - Only handles 'developer-agent' jobs — everything else uses GitHub cloud runners
#
# Usage:
#   bash scripts/setup-runner.sh
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth login)
#   - At least one of:
#       Claude Code: npm install -g @anthropic-ai/claude-code && claude auth login
#       Ollama:      brew install ollama && ollama pull qwen2.5-coder:7b

set -euo pipefail

RUNNER_DIR="$HOME/actions-runner"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")

if [[ -z "$REPO" ]]; then
  echo "❌  Could not detect repo. Run from inside the cloned repository."
  exit 1
fi

echo "🤖  WivWav Self-Hosted Runner Setup"
echo "    Repo:             ${REPO}"
echo "    Runner directory: ${RUNNER_DIR}"
echo ""

# ── Detect platform ────────────────────────────────────────────────────────────
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

if [[ "$OS" != "darwin" ]]; then
  echo "❌  This script is for macOS only."
  echo "    For Linux runners, follow: https://docs.github.com/en/actions/hosting-your-own-runners"
  exit 1
fi

RUNNER_ARCH="x64"
[[ "$ARCH" == "arm64" ]] && RUNNER_ARCH="arm64"

# ── Fetch latest runner version ────────────────────────────────────────────────
echo "🔍  Fetching latest runner version..."
RUNNER_VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
  | grep '"tag_name"' | grep -o 'v[0-9.]*' | head -1)
RUNNER_VERSION_NUM="${RUNNER_VERSION#v}"
echo "    Version: ${RUNNER_VERSION} (${RUNNER_ARCH})"

# ── Download and extract ───────────────────────────────────────────────────────
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

TARBALL="actions-runner-osx-${RUNNER_ARCH}-${RUNNER_VERSION_NUM}.tar.gz"

if [[ ! -f "run.sh" ]]; then
  echo "📥  Downloading runner..."
  curl -fsSL -o "$TARBALL" \
    "https://github.com/actions/runner/releases/download/${RUNNER_VERSION}/${TARBALL}"
  tar xzf "$TARBALL"
  rm -f "$TARBALL"
  echo "✅  Downloaded and extracted"
else
  echo "✅  Runner binary already present"
fi

# ── Configure ──────────────────────────────────────────────────────────────────
if [[ ! -f ".runner" ]]; then
  echo ""
  echo "🔑  Getting registration token..."
  REG_TOKEN=$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" --jq .token)

  echo "⚙️   Configuring runner..."
  ./config.sh \
    --url "https://github.com/${REPO}" \
    --token "$REG_TOKEN" \
    --name "$(hostname -s)-developer-agent" \
    --labels "self-hosted,developer-agent,macos" \
    --unattended
  echo "✅  Runner configured"
else
  echo "✅  Runner already configured"
  echo "    (Delete ${RUNNER_DIR}/.runner and re-run to reconfigure)"
fi

# ── Install as a launchd login service ────────────────────────────────────────
echo ""
echo "🚀  Installing as login service (auto-starts when you log in)..."
./svc.sh install 2>/dev/null || true
./svc.sh start   2>/dev/null || true
echo "✅  Service installed"

# ── Check developer agent dependencies ────────────────────────────────────────
echo ""
echo "🔍  Checking developer agent dependencies..."
echo ""

ok=true

check() {
  local cmd=$1 hint=$2
  if command -v "$cmd" &>/dev/null; then
    echo "  ✅  $cmd"
  else
    echo "  ⚠️   $cmd not found — $hint"
    ok=false
  fi
}

check "claude"  "npm install -g @anthropic-ai/claude-code  →  then: claude auth login"
check "ollama"  "brew install ollama  →  then: ollama pull qwen2.5-coder:7b"
check "pnpm"    "npm install -g pnpm"
check "node"    "brew install node"
check "python3" "brew install python (usually pre-installed on macOS)"
check "gh"      "brew install gh  →  then: gh auth login"

# Claude Code auth check
echo ""
if command -v claude &>/dev/null; then
  if [[ -d "$HOME/.claude" ]]; then
    echo "  ✅  Claude Code credentials found"
  else
    echo "  ⚠️   Claude Code installed but not authenticated"
    echo "       Run: claude auth login"
    ok=false
  fi
fi

# Ollama model check
if command -v ollama &>/dev/null; then
  MODEL="${AGENTS_OLLAMA_MODEL:-qwen2.5-coder:7b}"
  if ollama list 2>/dev/null | grep -q "${MODEL%%:*}"; then
    echo "  ✅  Ollama model ${MODEL} found"
  else
    echo "  ⚠️   Ollama model ${MODEL} not pulled"
    echo "       Run: ollama pull ${MODEL}"
  fi
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
if [[ "$ok" == "true" ]]; then
  echo "🎉  Setup complete. The developer agent is ready."
else
  echo "⚠️   Setup complete with warnings. Address the items above before the"
  echo "    developer agent can run. Re-run this script to verify."
fi

echo ""
echo "How it works:"
echo "  1. A PR gets labeled 'status:needs-changes' (by the code review agent)"
echo "  2. This runner wakes up and runs developer_agent.py"
echo "  3. Claude Code (or Ollama) reads the findings and fixes the code"
echo "  4. pnpm test + pnpm typecheck must pass before anything is committed"
echo "  5. If they pass  → commits fixes, re-labels to 'status:needs-review'"
echo "  6. If they fail  → reverts all changes, labels 'status:stuck'"
echo "  7. If runner is offline → job queues and runs when Mac comes back online"
echo ""
echo "Runner management:"
echo "  Stop:      cd ~/actions-runner && ./svc.sh stop"
echo "  Start:     cd ~/actions-runner && ./svc.sh start"
echo "  Uninstall: cd ~/actions-runner && ./svc.sh uninstall && ./config.sh remove"
echo "  Logs:      ~/actions-runner/_diag/"
echo ""
echo "Full reference: .github/SDLC.md"
