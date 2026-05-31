import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OllamaProvider } from './ollama-provider.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('OllamaProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls Ollama generate endpoint with correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: 'test response', done: true }),
    })

    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })
    const result = await provider.complete('system prompt', 'user prompt')

    expect(result).toBe('test response')
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
      method: 'POST',
    }))

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>
    expect(body['model']).toBe('llama3.2')
    expect(body['system']).toBe('system prompt')
    expect(body['prompt']).toBe('user prompt')
    expect(body['stream']).toBe(false)
  })

  it('throws when Ollama returns a non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })

    const provider = new OllamaProvider()
    await expect(provider.complete('s', 'u')).rejects.toThrow('Ollama request failed: 500')
  })

  it('uses default model and base URL when not configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: 'ok', done: true }),
    })

    const provider = new OllamaProvider()
    await provider.complete('s', 'u')

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>
    expect(body['model']).toBe('llama3.2')
    expect((mockFetch.mock.calls[0] as [string])[0]).toContain('localhost:11434')
  })
})

describe('OllamaProvider.isAvailable', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns true when /api/tags lists the configured model', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
    })

    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama3.2' })
    expect(await provider.isAvailable()).toBe(true)
    expect((mockFetch.mock.calls[0] as [string])[0]).toBe('http://localhost:11434/api/tags')
  })

  it('matches exact model name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2:latest' }, { name: 'codellama:7b' }] }),
    })

    const provider = new OllamaProvider({ model: 'codellama:7b' })
    expect(await provider.isAvailable()).toBe(true)
  })

  it('returns false when the model is not in the tag list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'mistral:latest' }] }),
    })

    const provider = new OllamaProvider({ model: 'llama3.2' })
    expect(await provider.isAvailable()).toBe(false)
  })

  it('returns false when /api/tags responds with non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

    const provider = new OllamaProvider()
    expect(await provider.isAvailable()).toBe(false)
  })

  it('returns false when fetch throws (e.g. connection refused)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const provider = new OllamaProvider()
    expect(await provider.isAvailable()).toBe(false)
  })

  it('returns false when fetch times out (AbortError)', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))

    const provider = new OllamaProvider()
    expect(await provider.isAvailable()).toBe(false)
  })
})
