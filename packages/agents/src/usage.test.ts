import { afterEach, describe, expect, it, vi } from 'vitest'
import { logCompletionUsage } from './usage.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logCompletionUsage', () => {
  it('writes a structured agents usage JSON line', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    logCompletionUsage({
      provider: 'anthropic',
      model: 'claude-test-model',
      role: 'coder',
      runId: 'run-1',
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationInputTokens: 30,
      cacheReadInputTokens: 40,
    })

    expect(info).toHaveBeenCalledTimes(1)
    const line = info.mock.calls[0]?.[0]
    expect(typeof line).toBe('string')
    expect(line).toMatch(/^\[agents:usage\] /)
    expect(JSON.parse(String(line).replace('[agents:usage] ', ''))).toEqual({
      provider: 'anthropic',
      model: 'claude-test-model',
      role: 'coder',
      runId: 'run-1',
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationInputTokens: 30,
      cacheReadInputTokens: 40,
    })
  })
})
