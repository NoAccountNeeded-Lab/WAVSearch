---
description: Run the WAVSearch review pipeline (reviewer, accessibility, tester, QA) against actual changed files using Claude Code sub-agents with full tool access. Use after implementation, before /finish-issue.
argument-hint: "[issue-number]"
---

# Review Pipeline

Runs four review roles from `packages/agents/src/roles.ts` as Claude Code sub-agents. Each sub-agent reads the real changed files using `Read` and `Bash` tools — not text snippets passed as context.

## Steps

1. Identify the issue number from `$ARGUMENTS` or context.

2. Get the list of changed files:
   ```bash
   git diff --name-only HEAD
   git diff --name-only --cached
   git ls-files --others --exclude-standard
   ```
   Combine all three. Exclude `.env` files, `node_modules`, `dist`, and generated Prisma output.

3. Read `packages/agents/src/roles.ts` now — you will use the `systemPrompt` field from the `reviewer`, `accessibility`, `tester`, and `qa` role objects as the core instruction for each sub-agent.

4. Spawn the **reviewer** sub-agent:

   Prompt template:
   ```
   You are a code reviewer for the WAVSearch monorepo.

   {reviewer.systemPrompt from roles.ts}

   Changed files for this review: {list}

   Use your Read tool to read each file before reviewing. Use Bash to run
   `git diff HEAD -- {file}` to see exactly what changed if a file is large.

   Report numbered findings labeled [CRITICAL], [WARNING], or [SUGGESTION].
   If nothing to flag, say so explicitly.

   End your response with exactly one of:
   REVISION_NEEDED: yes
   REVISION_NEEDED: no
   ```

5. Spawn the **accessibility** sub-agent **only if any file under `apps/web/` changed**:

   Prompt template:
   ```
   You are the accessibility reviewer for the WAVSearch monorepo.

   {accessibility.systemPrompt from roles.ts}

   Changed web files: {apps/web files from the list}

   Use your Read tool to read each file. Focus on WCAG 2.1 AA, keyboard,
   screen reader, touch targets, and mobile readability.

   Report numbered findings labeled [CRITICAL], [WARNING], or [SUGGESTION].
   If nothing to flag, say so explicitly.

   End your response with exactly one of:
   REVISION_NEEDED: yes
   REVISION_NEEDED: no
   ```

6. Spawn the **tester** sub-agent:

   Prompt template:
   ```
   You are the test engineer for the WAVSearch monorepo.

   {tester.systemPrompt from roles.ts}

   Changed files: {list}

   Use your Read tool to read each changed source file and its corresponding
   test file (foo.ts → foo.test.ts). Use Bash to run
   `pnpm test --reporter=verbose 2>&1 | tail -40` to see current test results.

   Identify missing test cases. Write any missing Vitest tests directly to disk
   using your Write/Edit tools — do not just describe them.

   Report what tests you wrote (or confirm coverage is sufficient).

   End your response with exactly one of:
   REVISION_NEEDED: yes
   REVISION_NEEDED: no
   ```

7. Spawn the **qa** sub-agent:

   Fetch the issue first: `gh issue view N --json title,body`

   Prompt template:
   ```
   You are the QA lead for the WAVSearch monorepo.

   {qa.systemPrompt from roles.ts}

   Issue being validated:
   Title: {title}
   Description: {body}

   Changed files: {list}

   Use your Read tool to read each changed file. Check that the implementation
   covers the acceptance criteria in the issue description.

   Report numbered findings labeled [CRITICAL], [WARNING], or [SUGGESTION].

   End your response with exactly one of:
   REVISION_NEEDED: yes
   REVISION_NEEDED: no
   ```

8. Collect all findings. Determine overall verdict:
   - If **any** sub-agent returned `REVISION_NEEDED: yes` → overall verdict is **REVISION NEEDED**
   - If **all** returned `REVISION_NEEDED: no` → overall verdict is **READY TO FINISH**

9. Report:
   - Findings grouped by role, numbered, labeled [CRITICAL] / [WARNING] / [SUGGESTION]
   - Overall verdict
   - If REVISION NEEDED: a prioritized fix list — address [CRITICAL] items first, then [WARNING]
