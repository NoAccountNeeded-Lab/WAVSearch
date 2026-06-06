#!/usr/bin/env python3
"""
AI Code Review — called by .github/workflows/code-review.yml
Reads the PR diff, sends it to the configured AI provider in chunks,
aggregates all findings, posts a single review comment, and flips the
label to status:needs-qa or status:needs-changes.
"""

import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import ai_client

# Each chunk must fit comfortably within the provider's per-request token budget.
# GitHub Models free tier: 8k token hard cap on the full request.
# Prompt overhead (~600 tokens) + response (1024 tokens) leaves ~6k tokens for diff.
# ~4 chars/token → ~24k chars per chunk is the safe ceiling.
MAX_CHUNK_CHARS = 20_000

# Files that are never worth reviewing — lock files, generated output, compiled artefacts
_SKIP_PATTERNS = [
    r"pnpm-lock\.yaml$",
    r"package-lock\.json$",
    r"yarn\.lock$",
    r"\.d\.ts$",
    r"^dist/",
    r"^build/",
    r"^\.next/",
    r"^out/",
    r"^coverage/",
    r"^\.turbo/",
    r"__generated__",
    r"\.snap$",
    r"\.min\.js$",
    r"\.min\.css$",
]


def filter_diff(diff: str) -> tuple[list[str], list[str]]:
    """Strip generated/lock file sections from a git diff.

    Returns (list_of_per_file_diff_strings, list_of_skipped_filenames).
    """
    chunks = re.split(r"(?=^diff --git )", diff, flags=re.MULTILINE)
    kept: list[str] = []
    skipped: list[str] = []

    for chunk in chunks:
        if not chunk.strip():
            continue
        m = re.match(r"^diff --git a/(.+?) b/", chunk)
        filename = m.group(1) if m else ""
        if any(re.search(p, filename) for p in _SKIP_PATTERNS):
            skipped.append(filename)
        else:
            kept.append(chunk)

    return kept, skipped


def batch_files(file_diffs: list[str]) -> list[str]:
    """Group per-file diffs into batches that each fit within MAX_CHUNK_CHARS."""
    batches: list[str] = []
    current: list[str] = []
    current_size = 0

    for file_diff in file_diffs:
        # If a single file is larger than the limit, truncate it alone
        if len(file_diff) > MAX_CHUNK_CHARS:
            if current:
                batches.append("".join(current))
                current, current_size = [], 0
            batches.append(file_diff[:MAX_CHUNK_CHARS] + "\n\n[file truncated]")
        elif current_size + len(file_diff) > MAX_CHUNK_CHARS:
            batches.append("".join(current))
            current, current_size = [file_diff], len(file_diff)
        else:
            current.append(file_diff)
            current_size += len(file_diff)

    if current:
        batches.append("".join(current))

    return batches


def parse_response(raw: str) -> dict:
    """Parse JSON from AI response, tolerating markdown fence wrapping."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start == -1:
            raise ValueError(f"Unparseable response:\n{raw}")
        return json.loads(raw[start:end])


def run(cmd: list[str], check: bool = True) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, check=check)
    return result.stdout.strip()


def post_comment(pr: str, repo: str, body: str) -> None:
    run(["gh", "pr", "comment", pr, "--repo", repo, "--body", body])


def flip_labels(pr: str, repo: str, *, remove: str, add: str) -> None:
    base = ["gh", "pr", "edit", pr, "--repo", repo]
    run(base + ["--remove-label", remove], check=False)
    run(base + ["--add-label", add])


def main() -> None:
    pr = os.environ.get("PR_NUMBER", "")
    pr_title = os.environ.get("PR_TITLE", "")
    pr_body = os.environ.get("PR_BODY", "")
    repo = os.environ.get("REPO", "")

    if not ai_client.is_configured():
        post_comment(
            pr, repo,
            "## 👀 Manual Review Needed\n\n"
            f"No AI reviewer is configured (`AGENTS_PROVIDER={ai_client.PROVIDER}` "
            "but the required credentials are absent).\n\n"
            "Please review this PR manually using `/code-review --comment` in a "
            "Claude Code session, then flip the label to "
            "`status:needs-qa` (approve) or `status:needs-changes` (changes needed).\n\n"
            "_Code Review · WivWav SDLC_",
        )
        sys.exit(0)

    try:
        with open("/tmp/pr.diff") as f:
            diff = f.read()
    except FileNotFoundError:
        print("No diff file found", file=sys.stderr)
        sys.exit(1)

    if not diff.strip():
        post_comment(pr, repo, "## ✅ Code Review\n\nNo diff detected — nothing to review.")
        flip_labels(pr, repo, remove="status:needs-review", add="status:needs-qa")
        return

    file_diffs, skipped_files = filter_diff(diff)

    if not file_diffs:
        post_comment(
            pr, repo,
            "## ✅ Code Review\n\n"
            "Only generated/lock files changed — nothing to review.\n\n"
            f"_Skipped: {', '.join(f'`{f}`' for f in skipped_files)}_",
        )
        flip_labels(pr, repo, remove="status:needs-review", add="status:needs-qa")
        return

    batches = batch_files(file_diffs)
    total_batches = len(batches)

    def make_prompt(chunk: str, batch_num: int) -> str:
        part_note = (
            f" (part {batch_num} of {total_batches})" if total_batches > 1 else ""
        )
        return f"""You are a senior code reviewer for WivWav — a wheelchair accessible vehicle
search aggregator. The stack is:
- Next.js 15 App Router (TypeScript, mobile-first, WCAG 2.1 AA required)
- Fastify REST API (TypeScript, Node 24)
- Prisma + PostgreSQL
- pnpm monorepo + Turborepo

Review this pull request diff{part_note} for correctness issues only. Focus on:
- Logic errors, off-by-one errors, wrong conditionals
- Missing error handling at system boundaries (user input, API responses, DB calls)
- Type safety gaps (unsafe casts, missing null checks)
- Security issues (XSS, injection, exposed secrets)
- WCAG 2.1 AA violations in UI changes (missing aria labels, broken keyboard nav,
  missing focus management, low contrast, missing alt text)
- Behaviour that contradicts the PR description

Do NOT flag style preferences, formatting, or speculative improvements.

PR #{pr}: {pr_title}

PR description:
{pr_body[:500]}

Diff:
{chunk}

Respond with a single JSON object — no markdown fences, no extra text:
{{
  "verdict": "approve" | "request_changes",
  "summary": "One or two sentences: overall assessment of this portion.",
  "findings": [
    {{
      "severity": "blocking" | "warning",
      "file": "relative/path/to/file.ts",
      "description": "What is wrong and why it matters."
    }}
  ]
}}

Only include findings that are actual defects or violations."""

    # Review each batch and aggregate findings
    all_findings: list[dict] = []
    any_request_changes = False
    summaries: list[str] = []

    for i, batch in enumerate(batches, 1):
        print(f"Reviewing batch {i}/{total_batches}…", file=sys.stderr)
        raw = ai_client.ask(make_prompt(batch, i), max_tokens=1024)
        try:
            result = parse_response(raw)
        except (ValueError, json.JSONDecodeError) as e:
            print(f"Batch {i} parse error: {e}", file=sys.stderr)
            sys.exit(1)

        if result.get("verdict") == "request_changes":
            any_request_changes = True
        if result.get("summary"):
            summaries.append(result["summary"])
        all_findings.extend(result.get("findings", []))

    verdict = "request_changes" if any_request_changes else "approve"
    icon = "✅" if verdict == "approve" else "🔍"
    label_word = "Approved" if verdict == "approve" else "Changes Requested"

    lines = [f"## {icon} Code Review — {label_word}", ""]
    if total_batches > 1:
        lines.append(f"_Reviewed in {total_batches} batches._")
        lines.append("")
    lines.append(" ".join(summaries))

    blocking = [f for f in all_findings if f.get("severity") == "blocking"]
    warnings  = [f for f in all_findings if f.get("severity") == "warning"]

    if blocking:
        lines += ["", "### Blocking issues"]
        for f in blocking:
            lines.append(f"\n**`{f.get('file', '?')}`** — {f.get('description', '')}")

    if warnings:
        lines += ["", "### Warnings"]
        for f in warnings:
            lines.append(f"\n**`{f.get('file', '?')}`** — {f.get('description', '')}")

    if skipped_files:
        lines += ["", f"_Skipped (generated/lock): {', '.join(f'`{f}`' for f in skipped_files)}_"]
    lines += ["", f"_Reviewed by {ai_client.provider_label()} · WivWav SDLC_"]

    post_comment(pr, repo, "\n".join(lines))

    if verdict == "approve":
        flip_labels(pr, repo, remove="status:needs-review", add="status:needs-qa")
    else:
        flip_labels(pr, repo, remove="status:needs-review", add="status:needs-changes")


if __name__ == "__main__":
    main()
