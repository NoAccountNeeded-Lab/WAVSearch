import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnthropicProvider } from './anthropic-provider.js'

const FAKE_API_KEY = 'sk-ant-api-test-key'
const FAKE_MODEL = 'claude-test-model'

function makeOkResponse(
  text: string,
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  },
) {
  return Response.json({
    content: [{ type: 'text', text }],
    ...(usage ? { usage } : {}),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AnthropicProvider', () => {
  it('sends correct headers and body to Anthropic API', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('hello'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY, model: FAKE_MODEL })
    const result = await provider.complete('sys prompt', 'user prompt')

    expect(result).toBe('hello')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body['model']).toBe(FAKE_MODEL)
    expect(body['system']).toEqual([
      {
        type: 'text',
        text: 'sys prompt',
        cache_control: { type: 'ephemeral' },
      },
    ])
    expect((body['messages'] as Array<{ role: string; content: string }>)[0]).toMatchObject({
      role: 'user',
      content: 'user prompt',
    })
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(FAKE_API_KEY)
    expect(headers['anthropic-version']).toBe('2023-06-01')
  })

  it('uses default model when none specified', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY })
    await provider.complete('s', 'u')

    const body = JSON.parse((fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1].body as string) as Record<string, unknown>
    expect(body['model']).toBe('claude-haiku-4-5-20251001')
  })

  it('passes maxTokens option', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY })
    await provider.complete('s', 'u', { maxTokens: 256 })

    const body = JSON.parse((fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1].body as string) as Record<string, unknown>
    expect(body['max_tokens']).toBe(256)
  })

  it('passes temperature option when provided', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY })
    await provider.complete('s', 'u', { temperature: 0.5 })

    const body = JSON.parse((fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1].body as string) as Record<string, unknown>
    expect(body['temperature']).toBe(0.5)
  })

  it('can disable prompt caching for incompatible gateways', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY, promptCaching: false })
    await provider.complete('s', 'u')

    const body = JSON.parse((fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1].body as string) as Record<string, unknown>
    expect(body['system']).toBe('s')
  })

  it('omits temperature when not provided', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY })
    await provider.complete('s', 'u')

    const body = JSON.parse((fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]![1].body as string) as Record<string, unknown>
    expect('temperature' in body).toBe(false)
  })

  it('uses custom baseUrl when provided', async () => {
    const fetchMock = vi.fn(async () => makeOkResponse('ok'))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY, baseUrl: 'http://proxy.test' })
    await provider.complete('s', 'u')

    const [url] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0]!
    expect(url).toBe('http://proxy.test/v1/messages')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })))

    const provider = new AnthropicProvider({ apiKey: 'bad-key' })
    await expect(provider.complete('s', 'u')).rejects.toThrow('401')
  })

  it('returns empty string when content array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ content: [] })))

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY })
    const result = await provider.complete('s', 'u')
    expect(result).toBe('')
  })

  it('logs normalized usage with cache fields when Anthropic returns usage metadata', async () => {
    const usageLogger = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        makeOkResponse('ok', {
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 40,
        }),
      ),
    )

    const provider = new AnthropicProvider({
      apiKey: FAKE_API_KEY,
      model: FAKE_MODEL,
      usageLogger,
    })
    await provider.complete('s', 'u', {
      usageContext: {
        role: 'coder',
        runId: 'run-1',
      },
    })

    expect(usageLogger).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: FAKE_MODEL,
      role: 'coder',
      runId: 'run-1',
      inputTokens: 10,
      outputTokens: 20,
      cacheCreationInputTokens: 30,
      cacheReadInputTokens: 40,
    })
  })

  it('does not log usage when Anthropic omits usage metadata', async () => {
    const usageLogger = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => makeOkResponse('ok')))

    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY, usageLogger })
    await provider.complete('s', 'u')

    expect(usageLogger).not.toHaveBeenCalled()
  })

  it('has name property set to anthropic', () => {
    const provider = new AnthropicProvider({ apiKey: FAKE_API_KEY })
    expect(provider.name).toBe('anthropic')
  })
})
