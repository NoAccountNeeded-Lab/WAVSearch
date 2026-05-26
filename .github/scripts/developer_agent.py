#!/usr/bin/env python3
"""
AI Developer Agent — called by .github/workflows/developer-agent.yml

Reads blocking findings from the most recent SDLC code review comment,
attempts to fix them using Claude Code CLI (primary) or Ollama patch
generation (fallback), verifies with pnpm test + typecheck, commits if
passing, reverts and escalates to status:stuck if not.

Runs on the self-hosted Mac runner so it can use tools already on the
machine — Claude Code (existing $20/month subscription) or Ollama (free).
No API key required for Claude Code when the user has done `claude auth login`.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import ai_client

MAX_OUTPUT_CHARS = 4_000
BOT_EMAIL = "github-actions[bot]@users.noreply.github.com"


# ── subprocess helpers ────────────────────────────────────────────────────────

def run(cmd: list[str], *, check: bool = True, capture: bool = True) -> str:
    result = subprocess.run(cmd, capture_output=capture, text=True, check=check)
    return result.stdout.strip() if capture else ""


def run_with_output(cmd: list[str]) -> tuple[int, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    output = (result.stdout + result.stderr)[-MAX_OUTPUT_CHARS:]
    return result.returncode, output


# ── GitHub helpers ────────────────────────────────────────────────────────────

def post_comment(pr: str, repo: str, body: str) -> None:
    run(["gh", "pr", "comment", pr, "--repo", repo, "--body", body])


def flip_labels(pr: str, repo: str, *, remove: str, add: str) -> None:
    base = ["gh", "pr", "edit", pr, "--repo", repo]
    run(base + ["--remove-label", remove], check=False)
    run(base + ["--add-label", add], check=False)


def latest_sdlc_review(pr: str, repo: str) -> str:
    """Fetch the body of the most recent SDLC code review comment."""
    raw = run(
        [
            "gh", "api",
            f"repos/{repo}/issues/{pr}/comments",
            "--jq",
            '[.[] | select(.body | contains("WAVSearch SDLC") and contains("Code Review"))] | last | .body // ""',
        ],
        check=False,
    )
    return raw.strip().strip('"')


# ── Finding parser ────────────────────────────────────────────────────────────

def parse_blocking_findings(body: str) -> list[dict]:
    """Extract blocking findings from the formatted review comment markdown."""
    m = re.search(r"### Blocking issues\n(.*?)(?=\n###|\Z)", body, re.DOTALL)
    if not m:
        return []

    section = m.group(1)
    findings = []
    for match in re.finditer(
        r"\*\*`([^`]+)`\*\*\s*[—–-]\s*(.+?)(?=\n\n\*\*`|\n\n###|\Z)",
        section,
        re.DOTALL,
    ):
        findings.append(
            {
                "file": match.group(1).strip(),
                "description": " ".join(match.group(2).strip().split()),
            }
        )
    return findings


# ── Loop guard ────────────────────────────────────────────────────────────────

def is_bot_last_committer() -> bool:
    """Return True if the last commit on this branch was made by the bot.

    Prevents infinite fix → review → fix loops.
    """
    last_email = run(["git", "log", "-1", "--format=%ae"], check=False)
    return last_email.strip() == BOT_EMAIL


# ── Test verification ─────────────────────────────────────────────────────────

def verify_tests() -> tuple[bool, str, str]:
    """Run pnpm test and typecheck. Returns (passing, test_output, tc_output)."""
    test_code, test_out = run_with_output(["pnpm", "test", "--run"])
    tc_code, tc_out = run_with_output(["pnpm", "typecheck"])
    return (test_code == 0 and tc_code == 0), test_out, tc_out


# ── Git helpers ───────────────────────────────────────────────────────────────

def get_changed_files() -> list[str]:
    """Return files modified since the last commit."""
    output = run(["git", "diff", "--name-only"], check=False)
    return [f for f in output.splitlines() if f.strip()]


def revert_changes() -> None:
    """Discard all uncommitted changes."""
    run(["git", "checkout", "--", "."], check=False)
    run(["git", "clean", "-fd"], check=False)


def commit_and_push(pr_head_ref: str, changed_files: list[str], findings: list[dict]) -> None:
    """Stage specific changed files, commit with [skip ci], and push."""
    for f in changed_files:
        run(["git", "add", f], check=False)

    fixed_list = "\n".join(f"- {f['file']}" for f in findings)
    msg = (
        f"fix: auto-repair {len(findings)} code review finding(s) [skip ci]\n\n"
        f"Files changed:\n{fixed_list}\n\n"
        f"Co-Authored-By: github-actions[bot] <{BOT_EMAIL}>"
    )
    run(["git", "commit", "-m", msg])
    run(["git", "push", "origin", f"HEAD:{pr_head_ref}"])


# ── Agent implementations ─────────────────────────────────────────────────────

def run_claude_agent(findings: list[dict], pr_number: str, pr_title: str) -> tuple[bool, str]:
    """Run claude CLI non-interactively to fix all findings.

    Uses the stored OAuth session from `claude auth login` — no API key needed.
    Returns (had_file_changes, agent_summary_output).
    """
    findings_text = "\n".join(
        f"{i + 1}. File: `{f['file']}`\n   Issue: {f['description']}"
        for i, f in enumerate(findings)
    )

    prompt = f"""You are fixing code issues in the WAVSearch repository \
(wheelchair accessible vehicle search aggregator).

PR #{pr_number}: "{pr_title}"

The code review found these blocking issues that must be fixed:

{findings_text}

Instructions:
1. Read each referenced file carefully before making changes
2. Fix only what is explicitly described — minimal, targeted changes only
3. Do NOT restructure or refactor code beyond what the fix requires
4. After all fixes, run: pnpm test --run
5. If tests fail, investigate and fix the root cause, or revert that specific change
6. Run: pnpm typecheck
7. If typecheck fails, fix the type errors or revert
8. Do NOT run git add, git commit, or git push — the workflow handles commits

When finished, output a brief summary of:
- Which issues you fixed and exactly what you changed
- Which issues you skipped and why
- Whether pnpm test and pnpm typecheck both pass
"""

    result = subprocess.run(
        ["claude", "--dangerously-skip-permissions", "-p", prompt],
        capture_output=True,
        text=True,
        check=False,
    )
    output = (result.stdout + result.stderr)[-MAX_OUTPUT_CHARS:]
    had_changes = bool(get_changed_files())
    return had_changes, output


def run_ollama_patches(findings: list[dict]) -> tuple[bool, str]:
    """Generate unified diff patches via Ollama and apply them.

    Less capable than Claude Code — works for simple, isolated fixes.
    Returns (had_file_changes, summary).
    """
    applied: list[str] = []
    skipped: list[str] = []

    for finding in findings:
        filepath = finding["file"]
        try:
            with open(filepath) as fh:
                content = fh.read()
        except FileNotFoundError:
            skipped.append(f"{filepath} — file not found in working tree")
            continue

        prompt = f"""Fix a specific issue in a TypeScript file.

File: {filepath}
Issue: {finding['description']}

Current file content:
```typescript
{content[:8_000]}
```

Output ONLY a unified diff patch in git diff format that fixes exactly this issue.
The patch must start with:
--- a/{filepath}
+++ b/{filepath}

No explanation, no prose, just the raw patch."""

        try:
            patch_text = ai_client.ask(prompt, max_tokens=1024)
        except Exception as exc:
            skipped.append(f"{filepath} — Ollama error: {exc}")
            continue

        with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as tmp:
            tmp.write(patch_text)
            tmp_path = tmp.name

        check = subprocess.run(
            ["git", "apply", "--check", tmp_path], capture_output=True, check=False
        )
        if check.returncode != 0:
            skipped.append(f"{filepath} — patch did not apply cleanly")
            os.unlink(tmp_path)
            continue

        subprocess.run(["git", "apply", tmp_path], check=False)
        applied.append(filepath)
        os.unlink(tmp_path)

    had_changes = bool(applied)
    parts = [f"Applied: {', '.join(applied) or 'none'}"]
    if skipped:
        parts.append(f"Skipped: {'; '.join(skipped)}")
    return had_changes, "\n".join(parts)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    pr = os.environ.get("PR_NUMBER", "")
    pr_title = os.environ.get("PR_TITLE", "")
    pr_head_ref = os.environ.get("PR_HEAD_REF", "")
    repo = os.environ.get("REPO", "")
    footer = "_Developer Agent · WAVSearch SDLC_"

    # ── Loop guard ────────────────────────────────────────────────────────────
    if is_bot_last_committer():
        post_comment(
            pr, repo,
            "## 🚧 Developer Agent — Escalating to Human\n\n"
            "The agent already committed fixes on this branch and the code review "
            "still found issues. This requires human judgment.\n\n" + footer,
        )
        flip_labels(pr, repo, remove="status:needs-changes", add="status:stuck")
        return

    # ── Fetch and parse findings ──────────────────────────────────────────────
    review_comment = latest_sdlc_review(pr, repo)
    if not review_comment:
        post_comment(
            pr, repo,
            "## 🚧 Developer Agent — No Review Found\n\n"
            "Could not find a structured SDLC code review comment. "
            "Please fix manually and re-label to `status:needs-review`.\n\n" + footer,
        )
        flip_labels(pr, repo, remove="status:needs-changes", add="status:stuck")
        return

    findings = parse_blocking_findings(review_comment)
    if not findings:
        post_comment(
            pr, repo,
            "## ℹ️ Developer Agent — No Blocking Issues\n\n"
            "No blocking issues found — only warnings remain. "
            "Review the warnings and re-label to `status:needs-review` when ready.\n\n"
            + footer,
        )
        # Leave label for human — warnings are judgment calls
        return

    # ── Select agent ─────────────────────────────────────────────────────────
    claude_available = bool(shutil.which("claude"))
    ollama_available = bool(shutil.which("ollama"))

    if claude_available:
        agent_name = "Claude Code"
        had_changes, agent_output = run_claude_agent(findings, pr, pr_title)
    elif ollama_available:
        agent_name = "Ollama"
        had_changes, agent_output = run_ollama_patches(findings)
    else:
        post_comment(
            pr, repo,
            "## 🚧 Developer Agent — Runner Not Configured\n\n"
            "Neither `claude` CLI nor `ollama` is available on the self-hosted runner.\n\n"
            "**To fix:** ensure the runner machine has one of:\n"
            "- Claude Code: `npm install -g @anthropic-ai/claude-code` then `claude auth login`\n"
            "- Ollama: `brew install ollama` then `ollama pull qwen2.5-coder:7b`\n\n"
            "Re-run `scripts/setup-runner.sh` to verify dependencies.\n\n" + footer,
        )
        flip_labels(pr, repo, remove="status:needs-changes", add="status:stuck")
        return

    # ── Verify — always run tests ourselves regardless of agent report ────────
    passing, test_out, tc_out = verify_tests()
    changed_files = get_changed_files()

    if not passing:
        revert_changes()
        detail = ""
        if test_out:
            detail += f"\n\n**Test output:**\n```\n{test_out}\n```"
        if tc_out:
            detail += f"\n\n**Typecheck output:**\n```\n{tc_out}\n```"
        post_comment(
            pr, repo,
            f"## ❌ Developer Agent — Tests Failed\n\n"
            f"{agent_name} applied fixes but tests did not pass. "
            f"All changes reverted.\n\n"
            f"**Agent summary:**\n{agent_output}"
            f"{detail}\n\n" + footer,
        )
        flip_labels(pr, repo, remove="status:needs-changes", add="status:stuck")
        return

    if not changed_files:
        post_comment(
            pr, repo,
            f"## ℹ️ Developer Agent — No Changes Made\n\n"
            f"{agent_name} ran but made no file changes. "
            f"These issues likely require manual fixes.\n\n"
            f"**Agent summary:**\n{agent_output}\n\n" + footer,
        )
        flip_labels(pr, repo, remove="status:needs-changes", add="status:stuck")
        return

    # ── Commit and re-queue for review ────────────────────────────────────────
    commit_and_push(pr_head_ref, changed_files, findings)

    files_list = "\n".join(f"- `{f}`" for f in changed_files)
    post_comment(
        pr, repo,
        f"## ✅ Developer Agent — Fixes Applied\n\n"
        f"{agent_name} fixed {len(findings)} blocking issue(s). "
        f"Tests and typecheck pass.\n\n"
        f"**Changed files:**\n{files_list}\n\n"
        f"**Agent summary:**\n{agent_output}\n\n" + footer,
    )
    flip_labels(pr, repo, remove="status:needs-changes", add="status:needs-review")


if __name__ == "__main__":
    main()
