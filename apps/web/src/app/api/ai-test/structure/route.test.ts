import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai-test/structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBadRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai-test/structure', {
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

/** Mock that routes config calls to 404 and all other calls to the Ollama factory. */
function mockFetch(ollamaFactory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
    return Promise.resolve(ollamaFactory())
  })
}

const SAMPLE_HTML = '<div class="listing"><h1 class="title">2022 Sienna WAV</h1><span class="price">$52,995</span></div>'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ai-test/structure', () => {
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
    const res = await POST(makeRequest({}))
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
    const res = await POST(makeRequest({ html: 123 }))
    expect(res.status).toBe(400)
  })

  // ── Successful response ─────────────────────────────────────────────────

  it('returns parsed fields array from Ollama JSON response', async () => {
    const ollamaResponse = JSON.stringify({
      fields: [
        { name: 'title', selector: '.title', sample: '2022 Sienna WAV' },
        { name: 'price', selector: '.price', sample: '$52,995' },
      ],
    })
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(ollamaResponse)))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { fields: Array<{ name: string; selector: string }> } }
    expect(body.data.fields).toHaveLength(2)
    expect(body.data.fields[0]?.name).toBe('title')
    expect(body.data.fields[1]?.selector).toBe('.price')
  })

  it('strips markdown fences and parses JSON', async () => {
    const wrapped = '```json\n{"fields":[{"name":"price","selector":".price","sample":"$52k"}]}\n```'
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(wrapped)))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { fields: Array<{ name: string }> } }
    expect(body.data.fields[0]?.name).toBe('price')
  })

  it('includes rawText and empty ollamaError on success', async () => {
    const ollamaResponse = JSON.stringify({ fields: [] })
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(ollamaResponse)))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { rawText: string; ollamaError: string } }
    expect(typeof body.data.rawText).toBe('string')
    expect(body.data.ollamaError).toBe('')
  })

  it('includes _meta with provider, model, and baseUrl', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(JSON.stringify({ fields: [] }))))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    const body = await res.json() as { data: { _meta: { provider: string; model: string; baseUrl: string } } }
    expect(body.data._meta.provider).toBe('ollama')
    expect(typeof body.data._meta.model).toBe('string')
    expect(typeof body.data._meta.baseUrl).toBe('string')
  })

  // ── Error scenarios — always 200 with empty fields ──────────────────────

  it('returns empty fields when Ollama returns non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaHttpError(503)))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { fields: unknown[]; ollamaError: string } }
    expect(body.data.fields).toEqual([])
    expect(body.data.ollamaError).toBeTruthy()
  })

  it('returns empty fields when Ollama body contains error field', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaErrorBody('model not found')))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { fields: unknown[]; ollamaError: string } }
    expect(body.data.fields).toEqual([])
    expect(body.data.ollamaError).toBe('model not found')
  })

  it('returns empty fields when Ollama returns invalid JSON', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse('not-json{')))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { fields: unknown[] } }
    expect(body.data.fields).toEqual([])
  })

  it('returns empty fields when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
      return Promise.reject(new Error('ECONNREFUSED'))
    }))

    const res = await POST(makeRequest({ html: SAMPLE_HTML }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { fields: unknown[]; ollamaError: string } }
    expect(body.data.fields).toEqual([])
    expect(body.data.ollamaError).toBeTruthy()
  })

  // ── Request shape ───────────────────────────────────────────────────────

  it('truncates html to 8000 chars in the Ollama prompt', async () => {
    const bigHtml = '<div>' + 'x'.repeat(9000) + '</div>'
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify({ fields: [] })))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: bigHtml }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt.length).toBeLessThanOrEqual(8000 + 20) // 20 chars slack for the "HTML snippet:\n" prefix
  })

  it('sends stream:false to Ollama', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse(JSON.stringify({ fields: [] })))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ html: SAMPLE_HTML }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { stream: boolean }
    expect(callBody.stream).toBe(false)
  })
})
