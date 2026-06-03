#!/bin/bash
# Pre-commit check: typecheck, lint, and test must pass before allowing commits
# This is called by Claude Code settings hook before attempting commits

set -e

echo "🔍 Running pre-commit checks..."

echo "  → TypeScript check..."
if ! pnpm typecheck; then
  echo "❌ TypeScript check failed. Fix errors and try again."
  exit 1
fi

echo "  → Lint..."
if ! pnpm lint; then
  echo "❌ Lint failed. Fix errors and try again."
  exit 1
fi

echo "  → Unit tests..."
if ! pnpm test; then
  echo "❌ Tests failed. Fix failures and try again."
  exit 1
fi

echo "✅ Pre-commit checks passed. Ready to commit."
exit 0
