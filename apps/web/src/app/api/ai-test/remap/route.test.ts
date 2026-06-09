import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai-test/remap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBadRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai-test/remap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json{{{',
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

function ollamaErrorBody(errorMsg: string): Response {
  return new Response(JSON.stringify({ error: errorMsg }), { status: 200 })
}

function ollamaHttpError(status = 500): Response {
  return new Response(JSON.stringify({ error: 'Internal Error' }), { status })
}

function mockFetch(ollamaFactory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
    return Promise.resolve(ollamaFactory())
  })
}

const SAMPLE_HTML = '<div><h2 class="vehicle-name">2020 Honda Odyssey</h2><div class="vehicle-cost">$38,500</div></div>'
const SAMPLE_MAPPINGS = [
  { targetField: 'title', selector: '.listing-title', attribute: null, transform: null },
  { targetField: 'price', selector: '.listing-price', attribute: null, transform: 'parsePrice' },
]

const VALID_REMAP_RESULT = {
  mappings: [
    { targetField: 'title', selector: '.vehicle-name', attribute: null, transform: null },
    { targetField: 'price', selector: '.vehicle-cost', attribute: null, transform: 'parsePrice' },
  ],
  confidence: 0.9,
  notes: 'Selectors updated for redesigned layout',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ai-test/remap', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Input validation ────────────────────────────────────────────────────

  it('returns 400 for invalid JSON body', async () => {
    const res = await POST(makeBadRequest())
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('returns 400 when html field is missing', async () => {
    const res = await POST(makeRequest({ previousMappings: [] }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).toMatch(/html/i)
  })

  it('returns 400 when html is whitespace-only', async () => {
    const res = await POST(makeRequest({ html: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when html is not a string', async () => {
    const res = await POST(makeRequest({ html: 42 }))
    expect(res.status).toBe(400)
  })

  // ── Successful response ─────────────────────────────────────────────────

  it('returns parsed mappings, confidence, and notes from Ollama', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT))))

    const res = await POST(makeRequest({ html: SAMPLE_HTML, previousMappings: SAMPLE_MAPPINGS }))
    expect(res.status).toBe(200)
    const body = await res.json() as {
      data: { mappings: Array<{ targetField: string; selector: string }>; confidence: number; notes: string }
    }
    expect(body.data.mappings).toHaveLength(2)
    expect(body.data.mappings[0]?.selector).toBe('.vehicle-name')
    expect(body.data.confidence).toBe(0.9)
    expect(body.data.notes).toBe('Selectors updated for redesigned layout')
  })

  it('strips markdown fences and parses JSON', async () => {
    const wrapped = '```json\n' + JSON.stringify(VALID_REMAP_RESULT) + '\n```'
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(wrapped)))

    const res = await POST(makeRequest({ html: SAMPLE_HTML, previousMappings: [] }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { mappings: unknown[] } }
    expect(body.data.mappings).toHaveLength(2)
  })

  it('uses "Test Source" when sourceName is not provided', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT)))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: SAMPLE_HTML }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt).toContain('Test Source')
  })

  it('uses provided sourceName in the prompt', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT)))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: SAMPLE_HTML, sourceName: 'BraunAbility Dealer', previousMappings: [] }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt).toContain('BraunAbility Dealer')
  })

  it('includes rawText, ollamaError, and _meta in response', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT))))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    const body = await res.json() as { data: { rawText: string; ollamaError: string; _meta: { provider: string } } }
    expect(typeof body.data.rawText).toBe('string')
    expect(body.data.ollamaError).toBe('')
    expect(body.data._meta.provider).toBe('ollama')
  })

  // ── Error scenarios — always 200 with empty mappings ───────────────────

  it('returns empty mappings when Ollama returns non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaHttpError(500)))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { mappings: unknown[]; confidence: number; ollamaError: string } }
    expect(body.data.mappings).toEqual([])
    expect(body.data.confidence).toBe(0)
    expect(body.data.ollamaError).toBeTruthy()
  })

  it('returns empty mappings when Ollama body contains error field', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaErrorBody('model "foo:latest" not found')))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { mappings: unknown[]; ollamaError: string } }
    expect(body.data.mappings).toEqual([])
    expect(body.data.ollamaError).toBe('model "foo:latest" not found')
  })

  it('returns empty mappings when Ollama returns invalid JSON', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse('not-json{')))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { mappings: unknown[] } }
    expect(body.data.mappings).toEqual([])
  })

  it('returns empty mappings when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
      return Promise.reject(new Error('ECONNREFUSED'))
    }))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { mappings: unknown[]; ollamaError: string } }
    expect(body.data.mappings).toEqual([])
    expect(body.data.ollamaError).toBeTruthy()
  })

  // ── Request shape ───────────────────────────────────────────────────────

  it('sends stream:false and temperature:0.1 to Ollama', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT)))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: SAMPLE_HTML }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { stream: boolean; options: { temperature: number } }
    expect(callBody.stream).toBe(false)
    expect(callBody.options.temperature).toBe(0.1)
  })

  it('truncates html to 8000 chars in the prompt', async () => {
    const bigHtml = '<div>' + 'x'.repeat(9000) + '</div>'
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT)))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: bigHtml }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    // The prompt contains the truncated HTML — verify total prompt length is bounded
    expect(callBody.prompt).not.toContain('x'.repeat(8001))
  })

  it('serialises previousMappings as JSON in the prompt', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify(VALID_REMAP_RESULT)))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: SAMPLE_HTML, previousMappings: SAMPLE_MAPPINGS }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt).toContain('.listing-title')
  })
})
