---
description: Merge a WAVSearch PR with rebase, update main, and clean up the branch. Use when the user asks to merge a PR, land a branch, or clean up after a PR is approved.
argument-hint: "[pr-number]"
---

# Merge PR

Use this skill only when the user explicitly asks to merge a PR or invokes `/wav-merge-pr`.

Squash and merge commits are disabled on this repo — always use `--rebase`.

---

## Step 1 — Identify the PR

If a PR number was passed as an argument, use it. Otherwise:

```bash
gh pr list
```

If the current branch has an associated open PR, use that. If ambiguous, ask the user which PR to merge.

---

## Step 2 — Check PR state

```bash
gh pr view {N} --json state,isDraft,mergeable,title,headRefName
```

- If `isDraft: true` — run `gh pr ready {N}` first, then continue.
- If `state` is not `OPEN` — check if it was already merged. If already merged, skip to Step 4.
- If `mergeable` is `CONFLICTING` — stop and report: the branch has conflicts that must be resolved manually.

---

## Step 3 — Check status checks

```bash
gh pr checks {N}
```

Stop and report if any required or expected check is failing, pending, skipped unexpectedly, or missing. Do not rely on the merge command alone unless the repository's branch protection blocks unsafe merges and the user explicitly asks to proceed.

---

## Step 4 — Merge

```bash
gh pr merge {N} --rebase --delete-branch
```

If this fails because the PR was already merged, continue to Step 5.

---

## Step 5 — Update main

```bash
git checkout main
git pull origin main
```

---

## Step 6 — Clean up

```bash
# Prune stale remote tracking refs
git remote prune origin

# Delete the local feature branch if it still exists (--delete-branch above handles the remote)
git branch -d {headRefName} 2>/dev/null || true
```

The remote branch is deleted by `--delete-branch` in Step 3. The local delete uses `-d` (safe delete — fails if unmerged), not `-D`.

---

## Step 7 — Report

State:
- The PR checks that passed before merge
- The commit(s) that landed on main (`git log origin/main -3 --oneline`)
- Which branch was cleaned up
- Any pruned remote tracking refs

If any step failed, report what failed and why — do not silently continue.

Then tell the user:
- "You are now on `main` with the merged changes. The feature branch has been deleted locally and remotely."
- If there are other open issues labeled `status:ready`, mention: "There are {N} issues ready to work on. Run `/wav-run-sprint` to start the next one, or pick an issue and run `/wav-start-issue {N}`."
- If no ready issues: "No issues are currently labeled `status:ready`. Check the backlog or create a new issue to continue."
