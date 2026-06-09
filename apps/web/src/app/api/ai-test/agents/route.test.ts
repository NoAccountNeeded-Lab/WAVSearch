import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai-test/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeBadRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai-test/agents', {
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

const SAMPLE_TASK = 'Add a wheelchair capacity filter to the listings search page.'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/ai-test/agents', () => {
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

  it('returns 400 when task field is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).toMatch(/task/i)
  })

  it('returns 400 when task is whitespace-only', async () => {
    const res = await POST(makeRequest({ task: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when task is not a string', async () => {
    const res = await POST(makeRequest({ task: 42 }))
    expect(res.status).toBe(400)
  })

  // ── Successful response ─────────────────────────────────────────────────

  it('returns the planner response text from Ollama', async () => {
    const planText = '1. Create filter component\n2. Add API param\n3. Update Meilisearch query'
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse(planText)))

    const res = await POST(makeRequest({ task: SAMPLE_TASK }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { response: string } }
    expect(body.data.response).toBe(planText)
  })

  it('returns empty ollamaError on success', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse('Implementation plan')))

    const res = await POST(makeRequest({ task: SAMPLE_TASK }))
    const body = await res.json() as { data: { ollamaError: string } }
    expect(body.data.ollamaError).toBe('')
  })

  it('includes _meta with provider, model, and baseUrl', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaOkResponse('plan')))

    const res = await POST(makeRequest({ task: SAMPLE_TASK }))
    const body = await res.json() as { data: { _meta: { provider: string; model: string; baseUrl: string } } }
    expect(body.data._meta.provider).toBe('ollama')
    expect(typeof body.data._meta.model).toBe('string')
    expect(typeof body.data._meta.baseUrl).toBe('string')
  })

  // ── Error scenarios — always 200 with empty response ───────────────────

  it('returns empty response when Ollama returns non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaHttpError(503)))

    const res = await POST(makeRequest({ task: SAMPLE_TASK }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { response: string; ollamaError: string } }
    expect(body.data.response).toBe('')
    expect(body.data.ollamaError).toBeTruthy()
  })

  it('returns empty response when Ollama body contains error field', async () => {
    vi.stubGlobal('fetch', mockFetch(() => ollamaErrorBody('llama3.1:8b not found, try ollama pull')))

    const res = await POST(makeRequest({ task: SAMPLE_TASK }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { response: string; ollamaError: string } }
    expect(body.data.response).toBe('')
    expect(body.data.ollamaError).toBe('llama3.1:8b not found, try ollama pull')
  })

  it('returns empty response when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
      return Promise.reject(new Error('fetch failed'))
    }))

    const res = await POST(makeRequest({ task: SAMPLE_TASK }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { response: string; ollamaError: string } }
    expect(body.data.response).toBe('')
    expect(body.data.ollamaError).toBeTruthy()
  })

  // ── Request shape ───────────────────────────────────────────────────────

  it('sends stream:false and num_predict:2048 to Ollama', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse('plan'))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ task: SAMPLE_TASK }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { stream: boolean; options: { num_predict: number } }
    expect(callBody.stream).toBe(false)
    expect(callBody.options.num_predict).toBe(2048)
  })

  it('truncates task to 4000 chars in the prompt', async () => {
    const longTask = 'a'.repeat(5000)
    const mockFetchFn = mockFetch(() => ollamaOkResponse('plan'))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ task: '  ' + longTask + '  ' }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt.length).toBe(4000)
    expect(callBody.prompt).not.toMatch(/^\s/)
  })

  it('sends the task as the prompt field', async () => {
    const mockFetchFn = mockFetch(() => ollamaOkResponse('plan'))
    vi.stubGlobal('fetch', mockFetchFn)

    await POST(makeRequest({ task: SAMPLE_TASK }))

    const ollamaCall = mockFetchFn.mock.calls.find(([url]) => (url as string).includes('/api/generate')) as [string, RequestInit]
    const callBody = JSON.parse(ollamaCall[1].body as string) as { prompt: string }
    expect(callBody.prompt).toBe(SAMPLE_TASK)
  })
})
