#!/usr/bin/env python3
"""
AI Code Review — called by .github/workflows/code-review.yml
Reads the PR diff, sends it to Claude, posts a review comment, and flips labels.
"""

import json
import os
import subprocess
import sys

import anthropic

MAX_DIFF_CHARS = 60_000  # ~15k tokens; truncate if larger


def run(cmd: list[str], check: bool = True) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, check=check)
    return result.stdout.strip()


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    pr_number = os.environ.get("PR_NUMBER", "")
    pr_title = os.environ.get("PR_TITLE", "")
    pr_body = os.environ.get("PR_BODY", "")
    repo = os.environ.get("REPO", "")

    if not api_key:
        # No AI reviewer configured — ask for a manual review and exit cleanly
        # so the label doesn't get stuck and the Action doesn't show as failed.
        post_comment(
            pr_number, repo,
            "## 👀 Manual Review Needed\n\n"
            "No AI code reviewer is configured (`ANTHROPIC_API_KEY` not set).\n\n"
            "Please review this PR manually using `/code-review --comment` in a "
            "Claude Code session, then flip the label to "
            "`status:needs-qa` (approve) or `status:needs-changes` (changes needed).\n\n"
            "_Code Review · WAVSearch SDLC_",
        )
        sys.exit(0)

    # Read diff written by the workflow step
    try:
        with open("/tmp/pr.diff") as f:
            diff = f.read()
    except FileNotFoundError:
        print("No diff file found", file=sys.stderr)
        sys.exit(1)

    if not diff.strip():
        post_comment(pr_number, repo, "## ✅ Code Review\n\nNo diff detected — nothing to review.")
        flip_labels(pr_number, repo, remove="status:needs-review", add="status:needs-qa")
        return

    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n\n[diff truncated — file too large]"

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""You are a senior code reviewer for WAVSearch — a wheelchair accessible vehicle
search aggregator. The stack is:
- Next.js 15 App Router (TypeScript, mobile-first, WCAG 2.1 AA required)
- Fastify REST API (TypeScript, Node 24)
- Prisma + PostgreSQL
- pnpm monorepo + Turborepo

Review this pull request diff for correctness issues only. Focus on:
- Logic errors, off-by-one errors, wrong conditionals
- Missing error handling at system boundaries (user input, API responses, DB calls)
- Type safety gaps (unsafe casts, missing null checks)
- Security issues (XSS, injection, exposed secrets)
- WCAG 2.1 AA violations in UI changes (missing aria labels, broken keyboard nav,
  missing focus management, low contrast, missing alt text)
- Behaviour that contradicts the PR description

Do NOT flag:
- Style preferences, formatting, or naming conventions (CI handles that)
- Speculative "would be nicer if" suggestions
- Things that work but could theoretically be cleaner

PR #{pr_number}: {pr_title}

PR description:
{pr_body[:2000]}

Diff:
{diff}

Respond with a single JSON object — no markdown fences, no extra text:
{{
  "verdict": "approve" | "request_changes",
  "summary": "One or two sentences: what this PR does and your overall assessment.",
  "findings": [
    {{
      "severity": "blocking" | "warning",
      "file": "relative/path/to/file.ts",
      "description": "What is wrong and why it matters."
    }}
  ]
}}

Only include findings that are actual defects or violations.
An empty findings array is fine when the code is correct."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()

    # Parse — handle models that wrap JSON in fences
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start == -1:
            print(f"Unparseable response:\n{raw}", file=sys.stderr)
            sys.exit(1)
        result = json.loads(raw[start:end])

    verdict: str = result.get("verdict", "request_changes")
    summary: str = result.get("summary", "")
    findings: list = result.get("findings", [])

    # Build comment
    icon = "✅" if verdict == "approve" else "🔍"
    label_word = "Approved" if verdict == "approve" else "Changes Requested"
    lines = [f"## {icon} Code Review — {label_word}", "", summary]

    blocking = [f for f in findings if f.get("severity") == "blocking"]
    warnings = [f for f in findings if f.get("severity") == "warning"]

    if blocking:
        lines += ["", "### Blocking issues"]
        for f in blocking:
            lines.append(f"\n**`{f.get('file', '?')}`** — {f.get('description', '')}")

    if warnings:
        lines += ["", "### Warnings"]
        for f in warnings:
            lines.append(f"\n**`{f.get('file', '?')}`** — {f.get('description', '')}")

    lines += ["", "_Reviewed by AI Code Reviewer (claude-haiku-4-5) · WAVSearch SDLC_"]

    post_comment(pr_number, repo, "\n".join(lines))

    if verdict == "approve":
        flip_labels(pr_number, repo, remove="status:needs-review", add="status:needs-qa")
    else:
        flip_labels(pr_number, repo, remove="status:needs-review", add="status:needs-changes")


def post_comment(pr_number: str, repo: str, body: str) -> None:
    run(["gh", "pr", "comment", pr_number, "--repo", repo, "--body", body])


def flip_labels(pr_number: str, repo: str, *, remove: str, add: str) -> None:
    base = ["gh", "pr", "edit", pr_number, "--repo", repo]
    run(base + ["--remove-label", remove], check=False)
    run(base + ["--add-label", add])


if __name__ == "__main__":
    main()
