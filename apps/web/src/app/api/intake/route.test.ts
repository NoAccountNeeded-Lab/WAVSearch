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

function anthropicOkResponse(jsonText: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text: jsonText }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function anthropicErrorResponse(status = 500): Response {
  return new Response(JSON.stringify({ error: 'Internal Error' }), { status })
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
 * Mock fetch that returns 404 for all config API calls — simulates no API key configured.
 * The intake route gracefully degrades to empty filters when no key is available.
 */
function mockFetchNoKey(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
    return Promise.resolve(new Response('', { status: 500 }))
  })
}

/**
 * Mock fetch that serves an API key via the config DB decrypt endpoint and
 * forwards Anthropic API calls to the provided response factory.
 */
function mockFetchWithKey(apiKey: string, anthropicFactory: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    const u = url as string
    if (u.includes('/admin/config/ai.intake.apiKeyId')) return Promise.resolve(configOkResponse('secret.anthropic.default'))
    if (u.includes('/admin/config/secret.anthropic.default/decrypt')) return Promise.resolve(configOkResponse(apiKey))
    if (u.includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
    return Promise.resolve(anthropicFactory())
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
  // No API key — graceful degradation
  // -------------------------------------------------------------------------

  it('returns empty filters when no API key is configured in the config DB', async () => {
    vi.stubGlobal('fetch', mockFetchNoKey())
    const res = await POST(makeRequest({ description: 'I need a rear-entry van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  // -------------------------------------------------------------------------
  // With API key from config DB — successful Anthropic response
  // -------------------------------------------------------------------------

  it('returns parsed filters from Anthropic response', async () => {
    const aiPayload = JSON.stringify({
      conversionType: 'rear_entry',
      rampType: 'in_floor',
      hasLift: null,
      handControls: null,
      condition: 'used',
      priceMax: 40000,
      state: 'TX',
    })
    vi.stubGlobal('fetch', mockFetchWithKey('test-key', () => anthropicOkResponse(aiPayload)))

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

  it('sends trimmed description, capped at 2000 chars, to Anthropic', async () => {
    const longDesc = 'a'.repeat(3000)
    const mockFetch = mockFetchWithKey('test-key', () => anthropicOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: '  ' + longDesc + '  ' }))

    const anthropicCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('api.anthropic.com')) as [string, RequestInit]
    const callBody = JSON.parse(anthropicCall[1].body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(callBody.messages[0]?.content.length).toBe(2000)
    expect(callBody.messages[0]?.content).not.toMatch(/^\s/)
  })

  // -------------------------------------------------------------------------
  // With API key — Anthropic error scenarios
  // -------------------------------------------------------------------------

  it('returns empty filters when Anthropic returns a non-ok status', async () => {
    vi.stubGlobal('fetch', mockFetchWithKey('test-key', () => anthropicErrorResponse(500)))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when Anthropic returns invalid JSON text', async () => {
    vi.stubGlobal('fetch', mockFetchWithKey('test-key', () => anthropicOkResponse('not-json{')))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when Anthropic returns valid JSON with no recognized fields', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWithKey('test-key', () => anthropicOkResponse(JSON.stringify({ someUnknownField: 'DROP_ME' }))),
    )

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('returns empty filters when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/admin/config/ai.intake.apiKeyId')) return Promise.resolve(configOkResponse('secret.anthropic.default'))
      if ((url as string).includes('/admin/config/secret.anthropic.default/decrypt')) return Promise.resolve(configOkResponse('test-key'))
      if ((url as string).includes('/admin/config/')) return Promise.resolve(configNotFoundResponse())
      return Promise.reject(new Error('Network failure'))
    }))

    const res = await POST(makeRequest({ description: 'I need a van' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { filters: Record<string, unknown> } }
    expect(body.data.filters).toEqual({})
  })

  it('sends the correct model ID and max_tokens to Anthropic', async () => {
    const mockFetch = mockFetchWithKey('test-key', () => anthropicOkResponse(JSON.stringify({ conversionType: null })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: 'I need a van' }))

    const anthropicCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('api.anthropic.com')) as [string, RequestInit]
    const callBody = JSON.parse(anthropicCall[1].body as string) as { model: string; max_tokens: number }
    expect(callBody.model).toBe('claude-haiku-4-5-20251001')
    expect(callBody.max_tokens).toBe(512)
  })

  it('passes correct Anthropic API version header and API key from config DB', async () => {
    const mockFetch = mockFetchWithKey('sk-ant-test', () => anthropicOkResponse(JSON.stringify({ state: 'FL' })))
    vi.stubGlobal('fetch', mockFetch)

    await POST(makeRequest({ description: 'Looking in Miami' }))

    const anthropicCall = mockFetch.mock.calls.find(([url]) => (url as string).includes('api.anthropic.com')) as [string, RequestInit]
    const headers = (anthropicCall[1].headers as Record<string, string>)
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['x-api-key']).toBe('sk-ant-test')
  })
})
