import { afterEach, describe, expect, it, vi } from 'vitest'
import { OllamaProvider } from './provider.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('OllamaProvider', () => {
  it('logs normalized usage when Ollama returns token counts', async () => {
    const usageLogger = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          response: 'ok',
          done: true,
          prompt_eval_count: 11,
          eval_count: 22,
        }),
      ),
    )

    const provider = new OllamaProvider({
      baseUrl: 'http://ollama.test',
      model: 'llama-test',
      usageLogger,
    })
    await provider.complete('s', 'u', {
      usageContext: {
        role: 'planner',
        runId: 'run-1',
      },
    })

    expect(usageLogger).toHaveBeenCalledWith({
      provider: 'ollama',
      model: 'llama-test',
      role: 'planner',
      runId: 'run-1',
      inputTokens: 11,
      outputTokens: 22,
    })
  })

  it('does not log usage when Ollama omits token counts', async () => {
    const usageLogger = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          response: 'ok',
          done: true,
        }),
      ),
    )

    const provider = new OllamaProvider({ usageLogger })
    await provider.complete('s', 'u')

    expect(usageLogger).not.toHaveBeenCalled()
  })
})
