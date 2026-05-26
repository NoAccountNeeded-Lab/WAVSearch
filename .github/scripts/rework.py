#!/usr/bin/env python3
"""
AI Rework Advisor — called by .github/workflows/rework.yml
Reads the most recent SDLC agent comment and posts a prioritised fix plan.
"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
import ai_client


def run(cmd: list[str], check: bool = True) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True, check=check)
    return result.stdout.strip()


def post_comment(pr: str, repo: str, body: str) -> None:
    run(["gh", "pr", "comment", pr, "--repo", repo, "--body", body])


def latest_sdlc_comment(pr: str, repo: str) -> str:
    """Return the body of the most recent SDLC agent comment, or empty string."""
    raw = run(
        [
            "gh", "api",
            f"repos/{repo}/issues/{pr}/comments",
            "--jq",
            '[.[] | select(.body | contains("WAVSearch SDLC"))] | last | .body // ""',
        ],
        check=False,
    )
    return raw.strip().strip('"')


def main() -> None:
    pr = os.environ.get("PR_NUMBER", "")
    title = os.environ.get("PR_TITLE", "")
    repo = os.environ.get("REPO", "")
    trigger = os.environ.get("TRIGGER_LABEL", "status:needs-changes")

    stage = "QA" if trigger == "status:qa-failed" else "code review"
    source = latest_sdlc_comment(pr, repo)[:4_000]

    if not source:
        source = f"(No prior SDLC agent comment found — PR was labeled `{trigger}`.)"

    footer = f"_Rework Advisor ({ai_client.provider_label()}) · WAVSearch SDLC_"

    if not ai_client.is_configured():
        post_comment(
            pr, repo,
            f"## 🔧 Rework Required\n\n"
            f"This PR was returned from {stage} (`{trigger}`). "
            f"Please address the issues in the previous agent comment, then:\n\n"
            f"1. Run `pnpm test` and `pnpm typecheck` — both must pass\n"
            f"2. Push your fixes\n"
            f"3. Remove `{trigger}` and add `status:needs-review`\n\n"
            f"_Rework Advisor · WAVSearch SDLC_",
        )
        return

    prompt = f"""You are the rework advisor for WAVSearch (wheelchair accessible vehicle search aggregator).

PR #{pr}: "{title}" was returned from {stage} with these findings:

---
{source}
---

Write a numbered, prioritised fix checklist for the developer who will address this PR.

Rules:
- Order: blocking issues first, warnings second, test coverage last
- Each item must name the specific file and describe the exact change needed
- If a finding is ambiguous, flag it as "clarification needed: [what's unclear]"
- Keep each item to one or two sentences — no padding
- Final item must always be:
  "Run `pnpm test` and `pnpm typecheck` locally — both must pass — then push, \
remove `{trigger}`, and add `status:needs-review`."

Under 300 words total."""

    plan = ai_client.ask(prompt, max_tokens=800)
    post_comment(
        pr, repo,
        f"## 🔧 Rework Plan\n\n{plan}\n\n{footer}",
    )


if __name__ == "__main__":
    main()
