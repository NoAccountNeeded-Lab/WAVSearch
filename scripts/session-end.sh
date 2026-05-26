#!/bin/bash
# Stop hook: auto-commit (if tests pass), push, and open a draft PR on feature branches.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Only act on feature branches
if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ] || [ "$BRANCH" = "HEAD" ]; then
  exit 0
fi

# Auto-commit any uncommitted changes — but only if tests pass
if ! git diff --quiet || ! git diff --staged --quiet; then
  echo "session-end: uncommitted changes on $BRANCH — running tests before committing..."
  if pnpm test --run --reporter=verbose 2>&1; then
    git add -A
    ISSUE_NUM=$(echo "$BRANCH" | grep -oE 'issue-[0-9]+' | grep -oE '[0-9]+' || echo "")
    if [ -n "$ISSUE_NUM" ]; then
      MSG="wip: auto-commit from session end (refs #$ISSUE_NUM)"
    else
      MSG="wip: auto-commit from session end"
    fi
    git commit -m "$MSG"
    echo "session-end: committed."
  else
    echo "session-end: tests failed — skipping auto-commit. Fix tests before committing."
    exit 0
  fi
fi

# Push unpushed commits
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")
if [ -z "$UPSTREAM" ]; then
  HAS_COMMITS=$(git log HEAD --oneline -1 2>/dev/null || echo "")
  if [ -n "$HAS_COMMITS" ]; then
    git push -u origin "$BRANCH"
    echo "session-end: pushed $BRANCH (new tracking branch)."
  fi
else
  UNPUSHED=$(git log "$UPSTREAM"..HEAD --oneline 2>/dev/null || echo "")
  if [ -n "$UNPUSHED" ]; then
    git push origin "$BRANCH"
    echo "session-end: pushed unpushed commits on $BRANCH."
  fi
fi

# Open a draft PR if one doesn't exist and the branch hasn't already been merged
EXISTING_PR=$(gh pr list --head "$BRANCH" --state all --json number,state --jq '.[0] | "\(.number):\(.state)"' 2>/dev/null || echo "")
PR_NUMBER="${EXISTING_PR%%:*}"
PR_STATE="${EXISTING_PR##*:}"

if [ "$PR_STATE" = "MERGED" ]; then
  echo "session-end: branch $BRANCH was already merged (PR #$PR_NUMBER) — skipping PR creation."
elif [ -z "$PR_NUMBER" ]; then
  PR_URL=$(gh pr create --draft --fill 2>/dev/null || echo "")
  if [ -n "$PR_URL" ]; then
    echo "session-end: draft PR created — $PR_URL"
  fi
else
  echo "session-end: PR #$PR_NUMBER already open for $BRANCH."
fi
