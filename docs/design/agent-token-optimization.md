# Agent Token Optimization

Issue: #183

## Goal

Reduce average tokens per closed issue by at least 40% without lowering implementation quality or increasing stuck runs.

The practical strategy is to keep stable context stable, keep always-on instructions short, and move detailed instructions behind task-specific files or subagents.

## Current Findings

### Claude API and Claude Code

Anthropic prompt caching works best when reusable content is at the beginning of the request and the cache breakpoint is placed on the last stable block before per-request content. Cache reads are much cheaper than fresh input tokens, but cache writes cost more than base input tokens, so cached content should be reused. The local `packages/agents` Anthropic provider now marks the stable role system prompt with an ephemeral cache breakpoint by default.

Claude Code is a separate product surface. Its `CLAUDE.md` files are loaded into every session and consume context; Anthropic recommends keeping project instructions concise and moving multi-step or path-specific procedures into skills or scoped rules. Claude Code subagents have isolated context windows, which is useful for log-heavy or search-heavy side tasks, but their returned summaries should stay concise.

Sources:

- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sub-agents

### Codex and OpenAI API

Codex uses `AGENTS.md` as repo guidance. This repo keeps `AGENTS.md` canonical for all agents, but the file is intentionally comprehensive. Codex workers should use it as the source of truth when they need full workflow or architecture details, while task-specific prompts should start with targeted searches and narrow reads.

OpenAI API prompt caching is automatic for prompts of at least 1024 tokens and depends on stable shared prefixes. To make OpenAI-backed agents cheaper, keep shared system/developer instructions and tool schemas stable at the front of the prompt and append per-issue context later.

Sources:

- https://github.com/openai/codex/blob/main/docs/agents_md.md
- https://platform.openai.com/docs/guides/prompt-caching

### Gemini API and Gemini CLI

Gemini API has implicit caching on current models and explicit caching for cases where cost savings need to be guaranteed. Google recommends putting large common content at the beginning of prompts and sending similar prefixes close together in time.

Gemini CLI loads `GEMINI.md` context files hierarchically and sends the concatenated context with every prompt. The repo-level `GEMINI.md` is therefore intentionally short and points to `AGENTS.md` only when deep reference is needed.

Sources:

- https://ai.google.dev/gemini-api/docs/caching
- https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html

### GitHub Copilot and Cursor

GitHub Copilot automatically adds repository custom instructions to requests. The repo already has `.github/copilot-instructions.md`; it now includes context-budget guidance so Copilot users do not repeatedly load large reference files unnecessarily.

Cursor project rules live under `.cursor/rules`. The new WivWav rule gives Cursor the same concise workflow/context-budget guidance without duplicating the full `AGENTS.md`.

Sources:

- https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- https://docs.cursor.com/en/context/rules

### Ollama and Local Models

Local models do not always expose provider-side prompt caching. The best optimization is prompt size: short always-on context, narrow file reads, small role prompts, and deterministic verification commands outside the model. Avoid asking local models to re-summarize full repo state when `rg`, tests, or typecheck can answer directly.

## Implementation Plan

1. Cache stable Anthropic role prompts in `packages/agents`.
2. Keep Claude Code startup context short with root `CLAUDE.md`, `.claude/core.md`, and scoped role/skill files.
3. Keep Codex canonical instructions in `AGENTS.md`, but explicitly discourage speculative full-file reads.
4. Add concise Gemini and Cursor entry points that point to `AGENTS.md` only for deep reference.
5. Keep Copilot repository instructions short and path/task-oriented.
6. Measure token usage by sprint run:
   - Claude Code: compare `ccusage` or account usage before/after a sprint.
   - `packages/agents`: log provider usage fields when APIs expose cached token counts.
   - GitHub issue/PR data: track completion, stuck labels, and review cycles per issue.

## Follow-Ups

- Add structured usage logging to `packages/agents` when provider responses include cache read/write token counts.
- Split `AGENTS.md` into optional topic imports only if multiple agents continue loading the full file unnecessarily.
- Add path-scoped Claude rules for `apps/web`, `apps/api`, and `apps/scraper` if Claude Code workers still over-read after this change.
