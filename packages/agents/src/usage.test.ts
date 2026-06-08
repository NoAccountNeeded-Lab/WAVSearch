import { describe, expect, it, vi } from 'vitest'
import { logCompletionUsage } from './usage.js'

describe('logCompletionUsage', () => {
  it('writes structured agents usage fields', () => {
    const info = vi.fn()
    const logger = {
      info,
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      level: 'info',
      child: vi.fn(),
    }

    logCompletionUsage(
      {
        provider: 'anthropic',
        model: 'claude-test-model',
        role: 'coder',
        runId: 'run-1',
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 30,
        cacheReadInputTokens: 40,
      },
      logger,
    )

    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(
      {
        event: 'agents.usage',
        provider: 'anthropic',
        model: 'claude-test-model',
        role: 'coder',
        runId: 'run-1',
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 30,
        cacheReadInputTokens: 40,
      },
      'Agent completion usage',
    )
  })
})
