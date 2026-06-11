import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// apiFetch (used by resolveOllamaConfig) calls next/headers; mock it so tests
// run without a real Next.js request context in the test environment.
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}))

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

function configOkResponse(value: unknown): Response {
  return new Response(JSON.stringify({ data: { value } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function configNotFoundResponse(): Response {
  return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 })
}

function ollamaOkResponse(responseText: string): Response {
  return new Response(JSON.stringify({ response: responseText, done: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ollamaErrorBodyResponse(errorMsg: string): Response {
  return new Response(JSON.stringify({ error: errorMsg }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ollamaHttpErrorResponse(status = 500): Response {
  return new Response(JSON.stringify({ error: 'Internal Error' }), { status })
}

/**
 * Mock fetch that serves the given Ollama response for the /api/generate call
 * and returns 404 for all config lookups (model falls back to default).
 */
function mockFetchOllama(ollamaFactory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
    return Promise.resolve(ollamaFactory())
  })
}

/**
 * Mock fetch that sets a specific model via the config DB, then forwards
 * Ollama calls to the provided factory.
 */
function mockFetchWithModel(model: string, ollamaFactory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/admin/config/ai.intake.model')) return Promise.resolve(configOkResponse(model))
    if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
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
  // Successful Ollama response — filter extraction
  // -------------------------------------------------------------------------

  it('returns parsed filters from Ollama JSON response', async () => {
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

  it('strips markdown fences and extracts JSON', async () => {
    const aiPayload = '```json\n{"conversionType":"side_entry","state":"CA"}\n```'
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaOkResponse(aiPayload)))

    const res = await POST(makeRequest({ description: 'side entry, California' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({ conversionType: 'side_entry', state: 'CA' })
  })

  it('includes rawText and ollamaError in the response envelope', async () => {
    const aiPayload = JSON.stringify({ state: 'FL' })
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaOkResponse(aiPayload)))

    const res = await POST(makeRequest({ description: 'Looking in Miami' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rawText: string; ollamaError: string } }
    expect(typeof body.data.rawText).toBe('string')
    expect(body.data.ollamaError).toBe('')
  })

  it('includes _meta with provider and model (no baseUrl)', async () => {
    vi.stubGlobal('fetch', mockFetchWithModel('llama3.2', () => ollamaOkResponse(JSON.stringify({ state: 'OR' }))))

    const res = await POST(makeRequest({ description: 'Oregon' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { _meta: { provider: string; model: string; baseUrl?: string } } }
    expect(body.data._meta.provider).toBe('ollama')
    expect(body.data._meta.model).toBe('llama3.2')
    expect(body.data._meta.baseUrl).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Description trimming and truncation
  // -------------------------------------------------------------------------

  it('sends trimmed description, capped at 2000 chars, to Ollama', async () => {
    const longDesc = 'a'.repeat(3000)
    const mockFetch = mockFetchOllama(() => ollamaOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: '  ' + longDesc + '  ' }))

    const ollamaCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt.length).toBe(2000)
    expect(callBody.prompt).not.toMatch(/^\s/)
  })

  // -------------------------------------------------------------------------
  // Ollama error scenarios — always 200 with empty filters
  // -------------------------------------------------------------------------

  it('returns empty filters when Ollama returns a non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaHttpErrorResponse(503)))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown>; ollamaError: string } }
    expect(body.data.filters).toEqual({})
    expect(body.data.ollamaError).toBeTruthy()
  })

  it('returns empty filters when Ollama response body contains an error field', async () => {
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaErrorBodyResponse('model not found')))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown>; ollamaError: string } }
    expect(body.data.filters).toEqual({})
    expect(body.data.ollamaError).toBe('model not found')
  })

  it('returns empty filters when Ollama returns invalid JSON text', async () => {
    vi.stubGlobal('fetch', mockFetchOllama(() => ollamaOkResponse('not-json{')))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when Ollama returns JSON with no recognized fields', async () => {
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
    const body = await res.json() as { data: { filters: Record<string, unknown>; ollamaError: string } }
    expect(body.data.filters).toEqual({})
    expect(body.data.ollamaError).toMatch(/network failure/i)
  })

  // -------------------------------------------------------------------------
  // Ollama request shape
  // -------------------------------------------------------------------------

  it('sends stream:false and correct options to Ollama', async () => {
    const mockFetch = mockFetchOllama(() => ollamaOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: 'I need a van' }))

    const ollamaCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { stream: boolean; options: { num_predict: number } }
    expect(callBody.stream).toBe(false)
    expect(callBody.options.num_predict).toBe(512)
  })

  it('uses the model from config DB when set', async () => {
    const mockFetch = mockFetchWithModel('mistral', () => ollamaOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: 'I need a van' }))

    const ollamaCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { model: string }
    expect(callBody.model).toBe('mistral')
  })
})
