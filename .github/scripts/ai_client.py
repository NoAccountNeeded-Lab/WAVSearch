#!/usr/bin/env python3
"""
Provider-agnostic AI client for WAVSearch GitHub Actions scripts.

Configuration (env vars):
  AGENTS_PROVIDER          anthropic (default) | openai | ollama

  Anthropic:
    ANTHROPIC_API_KEY      required
    AGENTS_ANTHROPIC_MODEL default: claude-haiku-4-5-20251001

  OpenAI:
    OPENAI_API_KEY         required
    AGENTS_OPENAI_MODEL    default: gpt-4o-mini

  Ollama (no key needed — requires a running Ollama server):
    AGENTS_OLLAMA_BASE_URL default: http://localhost:11434
    AGENTS_OLLAMA_MODEL    default: qwen2.5-coder:7b

Usage:
    import ai_client
    if not ai_client.is_configured():
        ...  # handle unconfigured case
    reply = ai_client.ask("review this diff...")
    label = ai_client.provider_label()   # e.g. "Claude claude-haiku-4-5-20251001"
"""

import os

PROVIDER = os.environ.get("AGENTS_PROVIDER", "anthropic").lower().strip()

# Model defaults per provider
_DEFAULTS = {
    "anthropic": "claude-haiku-4-5-20251001",
    "openai": "gpt-4o-mini",
    "ollama": "qwen2.5-coder:7b",
}


def is_configured() -> bool:
    """Return True if the active provider has the credentials it needs."""
    if PROVIDER == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    if PROVIDER == "ollama":
        return True  # No key needed; will fail at call time if server is unreachable
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def provider_label() -> str:
    """Short human-readable string for use in PR comment footers."""
    model = _active_model()
    names = {"anthropic": "Claude", "openai": "OpenAI", "ollama": "Ollama"}
    return f"{names.get(PROVIDER, PROVIDER)} {model}"


def ask(prompt: str, *, max_tokens: int = 1024) -> str:
    """Send prompt to the configured provider and return the response text."""
    if PROVIDER == "openai":
        return _ask_openai(prompt, max_tokens)
    if PROVIDER == "ollama":
        return _ask_ollama(prompt, max_tokens)
    return _ask_anthropic(prompt, max_tokens)


# ── Private helpers ───────────────────────────────────────────────────────────

def _active_model() -> str:
    env_key = f"AGENTS_{PROVIDER.upper()}_MODEL"
    return os.environ.get(env_key, _DEFAULTS.get(PROVIDER, "unknown"))


def _ask_anthropic(prompt: str, max_tokens: int) -> str:
    import anthropic  # type: ignore[import]
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(
        model=_active_model(),
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


def _ask_openai(prompt: str, max_tokens: int) -> str:
    import openai  # type: ignore[import]
    client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.chat.completions.create(
        model=_active_model(),
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return (response.choices[0].message.content or "").strip()


def _ask_ollama(prompt: str, max_tokens: int) -> str:
    import httpx  # type: ignore[import]
    base = os.environ.get("AGENTS_OLLAMA_BASE_URL", "http://localhost:11434")
    response = httpx.post(
        f"{base}/api/generate",
        json={"model": _active_model(), "prompt": prompt, "stream": False},
        timeout=180.0,
    )
    response.raise_for_status()
    return response.json()["response"].strip()
