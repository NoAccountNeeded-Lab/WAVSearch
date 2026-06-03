#!/bin/bash
# Returns a unique port for the current git worktree, derived from the issue
# number in the branch name. Safe to use concurrently across multiple worktrees.
#
# Usage:
#   PORT=$(bash scripts/worktree-port.sh api)   # 3100 + issue number
#   PORT=$(bash scripts/worktree-port.sh web)   # 4100 + issue number
#
# Main working tree (main branch) falls back to the default dev ports:
#   api → 3003   web → 3000
#
# Examples:
#   feat/issue-162-run-sprint  → api=3262  web=4262
#   fix/issue-47-listing-map   → api=3147  web=4147

APP=${1:-api}

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
ISSUE=$(echo "$BRANCH" | grep -oE '[0-9]+' | head -1)

if [ -z "$ISSUE" ] || [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  case "$APP" in
    web) echo 3000 ;;
    *)   echo 3003 ;;
  esac
  exit 0
fi

case "$APP" in
  web) echo $((4100 + ISSUE)) ;;
  *)   echo $((3100 + ISSUE)) ;;
esac
