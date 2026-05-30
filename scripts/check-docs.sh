#!/bin/bash
# Pre-commit documentation check: if API route files changed, AGENTS.md must be staged too.
# Called by Claude Code PreToolUse hook before git commit commands.

INPUT=$(cat)
CMD=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null <<< "$INPUT") || CMD=""

# Only run on git commit commands
if ! echo "$CMD" | grep -qE 'git\s+commit'; then
  exit 0
fi

STAGED=$(git diff --cached --name-only 2>/dev/null) || exit 0

# Only check when route files are staged
if ! echo "$STAGED" | grep -qE '^apps/api/src/routes/'; then
  exit 0
fi

# Pass if AGENTS.md is also staged
if echo "$STAGED" | grep -q '^AGENTS\.md$'; then
  exit 0
fi

echo "Documentation check failed: apps/api/src/routes/ changed but AGENTS.md is not staged."
echo ""
echo "Review the API routes table in AGENTS.md and update it if you added, removed, or renamed routes."
echo "Then: git add AGENTS.md && retry the commit."
exit 2
