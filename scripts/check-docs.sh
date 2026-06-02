#!/bin/bash
# Pre-commit guard called by Claude Code PreToolUse before git commit commands.
# Blocks route documentation drift, then runs the project pre-commit validation.

INPUT=$(cat)
CMD=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('command',''))" 2>/dev/null <<< "$INPUT") || CMD=""

# Only run on git commit commands
if ! echo "$CMD" | grep -qE 'git\s+commit'; then
  exit 0
fi

STAGED=$(git diff --cached --name-only 2>/dev/null) || exit 0

# Require AGENTS.md when route files are staged
if echo "$STAGED" | grep -qE '^apps/api/src/routes/'; then
  if ! echo "$STAGED" | grep -q '^AGENTS\.md$'; then
    echo "Documentation check failed: apps/api/src/routes/ changed but AGENTS.md is not staged."
    echo ""
    echo "Review the API routes table in AGENTS.md and update it if you added, removed, or renamed routes."
    echo "Then: git add AGENTS.md && retry the commit."
    exit 2
  fi
fi

bash scripts/pre-commit-check.sh
