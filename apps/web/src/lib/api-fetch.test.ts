import { describe, it, expect, vi, afterEach } from 'vitest'

// apiFetch calls next/headers to read x-request-id; provide a controllable
// mock so tests can simulate both the "header present" and "header absent"
// paths without a real Next.js request context.
const mockHeadersMap = new Map<string, string>()
vi.mock('next/headers', () => ({
  headers: vi.fn().mockImplementation(async () => mockHeadersMap),
}))

import { apiFetch } from './api-fetch'

afterEach(() => {
  vi.unstubAllGlobals()
  mockHeadersMap.clear()
})

describe('apiFetch', () => {
  it('forwards x-request-id from the incoming request when present', async () => {
    mockHeadersMap.set('x-request-id', 'incoming-id-123')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('http://api/v1/listings')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['x-request-id']).toBe('incoming-id-123')
  })

  it('generates a UUID x-request-id when no incoming header is present', async () => {
    // mockHeadersMap is empty — no x-request-id
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('http://api/v1/listings')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const rid = (init.headers as Record<string, string>)['x-request-id']
    expect(rid).toBeDefined()
    // UUID v4 pattern
    expect(rid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('merges caller-supplied headers without dropping x-request-id', async () => {
    mockHeadersMap.set('x-request-id', 'trace-abc')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('http://api/v1/listings', {
      headers: { Authorization: 'Bearer token' },
    })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const h = init.headers as Record<string, string>
    expect(h['x-request-id']).toBe('trace-abc')
    expect(h['Authorization']).toBe('Bearer token')
  })

  it('preserves other fetch init options (next, cache, method)', async () => {
    mockHeadersMap.set('x-request-id', 'trace-xyz')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('http://api/v1/listings', {
      next: { revalidate: 60 },
      method: 'POST',
    })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit & { next?: unknown }]
    expect(url).toBe('http://api/v1/listings')
    expect(init.method).toBe('POST')
    expect(init.next).toEqual({ revalidate: 60 })
  })

  it('does not allow a caller-supplied x-request-id to override the request-scoped one', async () => {
    mockHeadersMap.set('x-request-id', 'canonical-id')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    // apiFetch always sets x-request-id last, overriding any caller-supplied value
    await apiFetch('http://api/v1/listings', {
      headers: { 'x-request-id': 'caller-supplied' },
    })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    // The request-scoped id wins because it's spread after init.headers
    expect((init.headers as Record<string, string>)['x-request-id']).toBe('canonical-id')
  })
})
