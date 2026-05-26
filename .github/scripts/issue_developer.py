#!/usr/bin/env python3
"""
Issue Developer Agent — called by .github/workflows/issue-developer.yml

When an issue is manually labeled status:ready, this script:
  1. Creates a branch feat/issue-{N}-{slug}
  2. Labels the issue status:in-progress
  3. Runs Claude Code to implement the issue
  4. Verifies with pnpm test + typecheck
  5. If passing:  commits, pushes, opens draft PR, labels status:needs-review
  6. If failing:  reverts all changes, labels status:stuck, posts explanation
  7. If no changes made: labels status:stuck, asks for more detail

Runs on the self-hosted Mac runner so it uses the stored claude auth session.
No API key needed — uses your existing Claude Code subscription.
"""

import os
import re
import subprocess
import sys

BOT_EMAIL = "github-actions[bot]@users.noreply.github.com"
MAX_OUTPUT_CHARS = 4_000


# ── subprocess helpers ────────────────────────────────────────────────────────

def run(cmd: list[str], *, check: bool = True, capture: bool = True) -> str:
    result = subprocess.run(cmd, capture_output=capture, text=True, check=check)
    return result.stdout.strip() if capture else ""


def run_with_output(cmd: list[str]) -> tuple[int, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    output = (result.stdout + result.stderr)[-MAX_OUTPUT_CHARS:]
    return result.returncode, output


# ── GitHub helpers ────────────────────────────────────────────────────────────

def post_comment(issue: str, repo: str, body: str) -> None:
    run(["gh", "issue", "comment", issue, "--repo", repo, "--body", body])


def set_labels(issue: str, repo: str, *, remove: list[str], add: list[str]) -> None:
    base = ["gh", "issue", "edit", issue, "--repo", repo]
    for label in remove:
        run(base + ["--remove-label", label], check=False)
    for label in add:
        run(base + ["--add-label", label], check=False)


# ── Branch naming ─────────────────────────────────────────────────────────────

def branch_slug(title: str) -> str:
    """Turn an issue title into a short kebab-case slug (2-4 words)."""
    words = re.sub(r"[^a-z0-9 ]", "", title.lower()).split()
    stop = {"a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "with"}
    words = [w for w in words if w not in stop][:4]
    return "-".join(words) or "work"


# ── Test verification ─────────────────────────────────────────────────────────

def verify_tests() -> tuple[bool, str, str]:
    test_code, test_out = run_with_output(["pnpm", "test", "--run"])
    tc_code, tc_out = run_with_output(["pnpm", "typecheck"])
    return (test_code == 0 and tc_code == 0), test_out, tc_out


# ── Git helpers ───────────────────────────────────────────────────────────────

def get_changed_files() -> list[str]:
    output = run(["git", "diff", "--name-only", "HEAD"], check=False)
    untracked = run(["git", "ls-files", "--others", "--exclude-standard"], check=False)
    files = set(output.splitlines() + untracked.splitlines())
    return [f for f in files if f.strip()]


def revert_changes(branch: str) -> None:
    run(["git", "checkout", "main"], check=False)
    run(["git", "branch", "-D", branch], check=False)


# ── Claude Code agent ─────────────────────────────────────────────────────────

def run_claude_agent(issue_number: str, issue_title: str, issue_body: str) -> tuple[bool, str]:
    prompt = f"""You are a developer working on the WAVSearch repository — a wheelchair accessible \
vehicle (WAV) search aggregator built with Next.js (web), Fastify (API), and a Playwright scraper.

Your task is to implement the work described in GitHub issue #{issue_number}.

Issue title: {issue_title}

Issue body:
{issue_body}

Instructions:
1. Read CLAUDE.md at the repo root for architecture context, conventions, and key principles
2. Explore relevant source files before making changes
3. Implement the acceptance criteria described in the issue
4. Keep changes minimal and focused — do not refactor unrelated code
5. After implementing, run: pnpm test --run
6. If tests fail, fix the root cause (or revert that specific change if it's a pre-existing failure)
7. Run: pnpm typecheck
8. If typecheck fails, fix the type errors
9. Do NOT run git add, git commit, or git push — the workflow handles that

When finished, output a brief summary of:
- What you built and which files you changed
- Any acceptance criteria you could not implement and why
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


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    issue_number = os.environ.get("ISSUE_NUMBER", "")
    issue_title = os.environ.get("ISSUE_TITLE", "")
    issue_body = os.environ.get("ISSUE_BODY", "")
    repo = os.environ.get("REPO", "")
    footer = "_Issue Developer Agent · WAVSearch SDLC_"

    branch = f"feat/issue-{issue_number}-{branch_slug(issue_title)}"

    # ── Create branch ─────────────────────────────────────────────────────────
    run(["git", "checkout", "-b", branch])

    # ── Mark in progress ─────────────────────────────────────────────────────
    set_labels(issue_number, repo, remove=["status:ready"], add=["status:in-progress"])
    post_comment(
        issue_number, repo,
        f"Developer agent starting work on this issue.\n\n"
        f"Branch: `{branch}`\n\n" + footer,
    )

    # ── Run Claude Code ───────────────────────────────────────────────────────
    had_changes, agent_output = run_claude_agent(issue_number, issue_title, issue_body)

    if not had_changes:
        revert_changes(branch)
        post_comment(
            issue_number, repo,
            f"## ℹ️ Developer Agent — No Changes Made\n\n"
            f"Claude Code ran but made no file changes. The issue may need more detail "
            f"in the acceptance criteria before an agent can implement it.\n\n"
            f"**Agent summary:**\n{agent_output}\n\n" + footer,
        )
        set_labels(issue_number, repo, remove=["status:in-progress"], add=["status:stuck"])
        return

    # ── Verify tests ──────────────────────────────────────────────────────────
    passing, test_out, tc_out = verify_tests()

    if not passing:
        revert_changes(branch)
        detail = ""
        if test_out:
            detail += f"\n\n**Test output:**\n```\n{test_out}\n```"
        if tc_out:
            detail += f"\n\n**Typecheck output:**\n```\n{tc_out}\n```"
        post_comment(
            issue_number, repo,
            f"## ❌ Developer Agent — Tests Failed\n\n"
            f"Claude Code made changes but tests did not pass. All changes reverted.\n\n"
            f"**Agent summary:**\n{agent_output}"
            f"{detail}\n\n" + footer,
        )
        set_labels(issue_number, repo, remove=["status:in-progress"], add=["status:stuck"])
        return

    # ── Commit and push ───────────────────────────────────────────────────────
    changed_files = get_changed_files()
    for f in changed_files:
        run(["git", "add", f], check=False)

    commit_msg = (
        f"feat: implement #{issue_number} — {issue_title}\n\n"
        f"refs #{issue_number}\n\n"
        f"Co-Authored-By: github-actions[bot] <{BOT_EMAIL}>"
    )
    run(["git", "commit", "-m", commit_msg])
    run(["git", "push", "-u", "origin", branch])

    # ── Open draft PR ─────────────────────────────────────────────────────────
    files_list = "\n".join(f"- `{f}`" for f in changed_files)
    pr_body = (
        f"## Summary\n\n"
        f"Closes #{issue_number}\n\n"
        f"{agent_output}\n\n"
        f"## Changed files\n\n{files_list}\n\n"
        f"## Test plan\n\n"
        f"- [x] `pnpm test` passes\n"
        f"- [x] `pnpm typecheck` passes\n"
        f"- [ ] Manual QA per issue acceptance criteria\n\n"
        f"🤖 {footer}"
    )

    pr_url = run([
        "gh", "pr", "create",
        "--repo", repo,
        "--title", f"feat: {issue_title} (#{issue_number})",
        "--body", pr_body,
        "--draft",
        "--head", branch,
        "--base", "main",
    ], check=False)

    set_labels(issue_number, repo, remove=["status:in-progress"], add=["status:needs-review"])
    post_comment(
        issue_number, repo,
        f"## ✅ Developer Agent — PR Ready for Review\n\n"
        f"Implementation complete. Tests and typecheck pass.\n\n"
        f"**PR:** {pr_url.strip()}\n\n"
        f"**Agent summary:**\n{agent_output}\n\n" + footer,
    )


if __name__ == "__main__":
    main()
