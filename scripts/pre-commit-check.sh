#!/bin/bash
# Pre-commit check: typecheck, lint, and test must pass before allowing commits
# This is called by Claude Code settings hook before attempting commits

FAILED=0

echo "🔍 Running pre-commit checks..."

echo "  → TypeScript check..."
if ! pnpm typecheck; then
  echo "❌ TypeScript check failed."
  FAILED=1
fi

echo "  → Lint..."
if ! pnpm lint; then
  echo "❌ Lint failed."
  FAILED=1
fi

echo "  → Unit tests..."
if ! pnpm test; then
  echo "❌ Tests failed."
  FAILED=1
fi

if [ $FAILED -ne 0 ]; then
  echo "❌ Pre-commit checks failed. Fix errors above and try again."
  exit 1
fi

echo "✅ Pre-commit checks passed. Ready to commit."
exit 0
