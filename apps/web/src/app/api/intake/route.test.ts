import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBadRequest(): NextRequest {
  return new NextRequest('http://localhost/api/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json{{{',
  })
}

function ollamaOkResponse(jsonText: string): Response {
  return new Response(
    JSON.stringify({ response: jsonText, done: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function ollamaErrorResponse(status = 500): Response {
  return new Response(JSON.stringify({ error: 'model not found' }), { status })
}

function configNotFoundResponse(): Response {
  return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 })
}

function configOkResponse(value: unknown): Response {
  return new Response(JSON.stringify({ data: { value } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Mock fetch that returns 404 for all config keys and forwards /api/generate
 * calls to the provided factory.
 */
function mockFetchOllama(ollamaFactory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    const u = url as string
    if (u.includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
    return Promise.resolve(ollamaFactory())
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/intake', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it('returns 400 for invalid JSON body', async () => {
    const res = await POST(makeBadRequest())
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('returns 400 when description is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).toMatch(/description/i)
  })

  it('returns 400 when description is not a string', async () => {
    const res = await POST(makeRequest({ description: 42 }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('returns 400 when description is whitespace-only', async () => {
    const res = await POST(makeRequest({ description: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  // -------------------------------------------------------------------------
  // Successful Ollama response
  // -------------------------------------------------------------------------

  it('returns parsed filters from Ollama response', async () => {
    const aiPayload = JSON.stringify({
      conversionType: 'rear_entry',
      rampType: 'in_floor',
      hasLift: null,
      handControls: null,
      condition: 'used',
      priceMax: 40000,
      state: 'TX',
    })
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaOkResponse(aiPayload)))

    const res = await POST(makeRequest({ description: 'rear-entry van, used, under $40k in Texas' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({
      conversionType: 'rear_entry',
      rampType: 'in_floor',
      condition: 'used',
      priceMax: 40000,
      state: 'TX',
    })
  })

  it('sends trimmed description, capped at 2000 chars, as the Ollama prompt', async () => {
    const longDesc = 'a'.repeat(3000)
    const mockFetch = mockFetchOllama(() => ollamaOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: '  ' + longDesc + '  ' }))

    const ollamaCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt.length).toBe(2000)
    expect(callBody.prompt).not.toMatch(/^\s/)
  })

  it('sends the default model and correct num_predict to Ollama', async () => {
    const mockFetch = mockFetchOllama(() => ollamaOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: 'I need a van' }))

    const ollamaCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as {
      model: string
      stream: boolean
      options: { num_predict: number; temperature: number }
    }
    expect(callBody.model).toBe('llama3.2')
    expect(callBody.stream).toBe(false)
    expect(callBody.options.num_predict).toBe(512)
  })

  it('uses model from config DB when set', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      const u = url as string
      if (u.includes('/admin/config/ai.intake.model')) return Promise.resolve(configOkResponse('llama3.1:70b'))
      if (u.includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
      return Promise.resolve(ollamaOkResponse(JSON.stringify({})))
    })
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: 'I need a van' }))

    const ollamaCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { model: string }
    expect(callBody.model).toBe('llama3.1:70b')
  })

  it('includes ollama _meta in response', async () => {
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaOkResponse(JSON.stringify({ state: 'FL' }))))

    const res = await POST(makeRequest({ description: 'Looking in Miami' }))
    const body = await res.json() as { data: { _meta: { provider: string; model: string; baseUrl: string } } }
    expect(body.data._meta.provider).toBe('ollama')
    expect(body.data._meta.model).toBe('llama3.2')
    expect(body.data._meta.baseUrl).toMatch(/^http/)
  })

  // -------------------------------------------------------------------------
  // Ollama error scenarios — graceful degradation
  // -------------------------------------------------------------------------

  it('returns empty filters when Ollama returns a non-ok status', async () => {
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaErrorResponse(500)))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when Ollama returns invalid JSON in response field', async () => {
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaOkResponse('not-json{')))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when Ollama returns valid JSON with no recognized fields', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOllama(() => ollamaOkResponse(JSON.stringify({ someUnknownField: 'DROP_ME' }))),
    )

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
      return Promise.reject(new Error('Network failure'))
    }))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })
})
