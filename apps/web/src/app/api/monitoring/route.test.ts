import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body: 'sentry-envelope-body',
  })
}

describe('POST /api/monitoring', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards Sentry envelopes to the SaaS ingest endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const res = await POST(makeRequest('/api/monitoring?o=123&p=456'))

    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://o123.ingest.sentry.io/api/456/envelope/?hsts=0',
      expect.objectContaining({
        method: 'POST',
        body: 'sentry-envelope-body',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
      }),
    )
  })

  it('forwards regional Sentry envelopes to the regional ingest endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', mockFetch)

    const res = await POST(makeRequest('/api/monitoring?o=123&p=456&r=de'))

    expect(res.status).toBe(202)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://o123.ingest.de.sentry.io/api/456/envelope/?hsts=0',
      expect.any(Object),
    )
  })

  it('returns 400 when required tunnel parameters are invalid', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const res = await POST(makeRequest('/api/monitoring?o=abc&p=456'))

    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  it('passes through upstream Sentry status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429 })))

    const res = await POST(makeRequest('/api/monitoring?o=123&p=456'))

    expect(res.status).toBe(429)
  })
})
