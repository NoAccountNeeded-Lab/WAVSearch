#!/bin/bash
# Pre-commit check: typecheck and test must pass before allowing commits
# This is called by Claude Code settings hook before attempting commits

set -e

echo "🔍 Running pre-commit checks..."

echo "  → TypeScript check..."
if ! pnpm typecheck > /dev/null 2>&1; then
  echo "❌ TypeScript check failed. Fix errors and try again."
  exit 1
fi

echo "  → Unit tests..."
if ! pnpm test > /dev/null 2>&1; then
  echo "❌ Tests failed. Fix failures and try again."
  exit 1
fi

echo "✅ Pre-commit checks passed. Ready to commit."
exit 0
