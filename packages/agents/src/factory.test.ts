import { describe, it, expect, vi, afterEach } from 'vitest'
import { createProvider } from './factory.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createProvider', () => {
  it('returns OllamaProvider for AGENTS_PROVIDER=ollama', () => {
    vi.stubEnv('AGENTS_PROVIDER', 'ollama')
    expect(createProvider().name).toBe('ollama')
  })

  it('returns AnthropicProvider for AGENTS_PROVIDER=anthropic', () => {
    vi.stubEnv('AGENTS_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    expect(createProvider().name).toBe('anthropic')
  })

  it('returns OpenAIProvider for AGENTS_PROVIDER=openai', () => {
    vi.stubEnv('AGENTS_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    expect(createProvider().name).toBe('openai')
  })

  it('returns CopilotProvider for AGENTS_PROVIDER=copilot', () => {
    vi.stubEnv('AGENTS_PROVIDER', 'copilot')
    vi.stubEnv('AGENTS_COPILOT_TOKEN', 'test-token')
    expect(createProvider().name).toBe('copilot')
  })

  it('throws for an unknown provider name', () => {
    vi.stubEnv('AGENTS_PROVIDER', 'wizard')
    expect(() => createProvider()).toThrow('Unknown AGENTS_PROVIDER')
  })

  it('defaults to anthropic when AGENTS_PROVIDER is unset', () => {
    vi.stubEnv('AGENTS_PROVIDER', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    // Empty string falls through to the default branch (anthropic), not an unknown provider.
    // This test documents the current default behaviour.
    const provider = createProvider()
    expect(provider.name).toBe('anthropic')
  })
})
