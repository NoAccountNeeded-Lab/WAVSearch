import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveOllamaConfig, OLLAMA_DEFAULT_MODEL, OLLAMA_DEFAULT_BASE_URL } from './resolve-ollama-config'

// apiFetch calls next/headers to read x-request-id; mock it so the module
// loads without a real Next.js request context in the test environment.
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}))

function configOkResponse(value: unknown): Response {
  return new Response(JSON.stringify({ data: { value } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function configNotFoundResponse(): Response {
  return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 })
}

describe('resolveOllamaConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns the default model when the config key is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configNotFoundResponse()))
    const result = await resolveOllamaConfig('ai.scraper.structure.model')
    expect(result.model).toBe(OLLAMA_DEFAULT_MODEL)
  })

  it('returns the model from config DB when found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configOkResponse('qwen2.5-coder:7b')))
    const result = await resolveOllamaConfig('ai.scraper.remap.model')
    expect(result.model).toBe('qwen2.5-coder:7b')
  })

  it('falls back to default model when config value is not a string', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configOkResponse(42)))
    const result = await resolveOllamaConfig('ai.intake.model')
    expect(result.model).toBe(OLLAMA_DEFAULT_MODEL)
  })

  it('falls back to default model when config value is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configOkResponse(null)))
    const result = await resolveOllamaConfig('ai.agents.model')
    expect(result.model).toBe(OLLAMA_DEFAULT_MODEL)
  })

  it('returns OLLAMA_BASE_URL env var as baseUrl when set', async () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://gpu-server:11434')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configNotFoundResponse()))
    const result = await resolveOllamaConfig('ai.intake.model')
    expect(result.baseUrl).toBe('http://gpu-server:11434')
  })

  it('returns the default base URL when OLLAMA_BASE_URL is not set', async () => {
    // Ensure the env var is absent — unstubAllEnvs() in afterEach handles cleanup
    delete process.env['OLLAMA_BASE_URL']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(configNotFoundResponse()))
    const result = await resolveOllamaConfig('ai.intake.model')
    expect(result.baseUrl).toBe(OLLAMA_DEFAULT_BASE_URL)
  })

  it('falls back to defaults when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const result = await resolveOllamaConfig('ai.intake.model')
    expect(result.model).toBe(OLLAMA_DEFAULT_MODEL)
    expect(typeof result.baseUrl).toBe('string')
  })

  it('encodes the config key in the request URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(configOkResponse('llama3.2'))
    vi.stubGlobal('fetch', mockFetch)
    await resolveOllamaConfig('ai.scraper.structure.model')
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('ai.scraper.structure.model')
  })
})
