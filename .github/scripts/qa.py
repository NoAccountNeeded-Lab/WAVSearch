#!/usr/bin/env python3
"""
AI QA Agent — called by .github/workflows/qa.yml
Runs tests and typecheck, then posts a human-readable summary and flips labels.
"""

import os
import sys

import anthropic

MAX_OUTPUT_CHARS = 4_000  # keep prompts reasonable


def read(path: str) -> str:
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def run_gh(args: list[str]) -> None:
    import subprocess
    subprocess.run(["gh"] + args, check=False)


def post_comment(pr: str, repo: str, body: str) -> None:
    run_gh(["pr", "comment", pr, "--repo", repo, "--body", body])


def flip_labels(pr: str, repo: str, *, remove: str, add: str) -> None:
    run_gh(["pr", "edit", pr, "--repo", repo, "--remove-label", remove])
    run_gh(["pr", "edit", pr, "--repo", repo, "--add-label", add])


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    pr = os.environ.get("PR_NUMBER", "")
    title = os.environ.get("PR_TITLE", "")
    repo = os.environ.get("REPO", "")
    tests_ok = os.environ.get("TESTS_EXIT_CODE", "0") == "0"
    typecheck_ok = os.environ.get("TYPECHECK_EXIT_CODE", "0") == "0"
    missing_count = int(os.environ.get("MISSING_TESTS_COUNT", "0"))

    test_out = read("/tmp/test-output.txt")[-MAX_OUTPUT_CHARS:]
    tc_out = read("/tmp/typecheck-output.txt")[-MAX_OUTPUT_CHARS:]
    missing_files = read("/tmp/missing-tests.txt")

    all_green = tests_ok and typecheck_ok and missing_count == 0

    if all_green:
        post_comment(
            pr, repo,
            "## ✅ QA Passed\n\n"
            "All unit tests and typecheck pass. "
            "No new source files are missing test coverage.\n\n"
            "_QA Agent (claude-haiku-4-5) · WAVSearch SDLC_",
        )
        flip_labels(pr, repo, remove="status:needs-qa", add="status:qa-passed")
        return

    # Build failure context
    sections: list[str] = []
    if not tests_ok:
        sections.append(f"**Unit tests failed:**\n```\n{test_out}\n```")
    if not typecheck_ok:
        sections.append(f"**Typecheck failed:**\n```\n{tc_out}\n```")
    if missing_count > 0:
        sections.append(
            f"**{missing_count} new source file(s) have no test file:**\n```\n{missing_files}\n```"
        )

    if not api_key:
        # Fallback: plain list without Claude
        items = []
        if not tests_ok:
            items.append("- Unit tests failed — see CI output for details")
        if not typecheck_ok:
            items.append("- Typecheck failed — see CI output for details")
        if missing_count > 0:
            items.append(f"- {missing_count} new source file(s) are missing test coverage")
        body = (
            "## ❌ QA Failed\n\n"
            + "\n".join(items)
            + "\n\n_QA Agent · WAVSearch SDLC_"
        )
        post_comment(pr, repo, body)
        flip_labels(pr, repo, remove="status:needs-qa", add="status:qa-failed")
        return

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""You are the QA agent for WAVSearch (wheelchair accessible vehicle search).

PR #{pr}: "{title}" failed one or more quality gates:

{chr(10).join(sections)}

Write a concise, actionable failure report (under 350 words):
- For each failure: what broke, the specific file/line if visible, and exactly what the developer must change
- For missing tests: name each file and what behaviour needs to be covered
- End with: "Fix the issues above, ensure `pnpm test` and `pnpm typecheck` both pass locally, then push and re-label as `status:needs-review`."

Be specific. Do not pad."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    summary = response.content[0].text.strip()
    post_comment(
        pr, repo,
        f"## ❌ QA Failed\n\n{summary}\n\n_QA Agent (claude-haiku-4-5) · WAVSearch SDLC_",
    )
    flip_labels(pr, repo, remove="status:needs-qa", add="status:qa-failed")


if __name__ == "__main__":
    main()
