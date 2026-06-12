import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportError } from './error-reporter.js'

// ---------------------------------------------------------------------------
// DOM / window stubs
// ---------------------------------------------------------------------------

// Provide a minimal document.body with a controllable data-api-url attribute.
// This runs in the default Node environment so we stub the globals ourselves.
function setupDom(apiUrl: string | null = 'http://api.test') {
  const body = {
    getAttribute: vi.fn((attr: string) => (attr === 'data-api-url' ? apiUrl : null)),
  }
  vi.stubGlobal('document', { body })
  vi.stubGlobal('window', {
    location: { href: 'http://localhost:3000/current-page' },
    fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  })
}

beforeEach(() => {
  setupDom()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Early-exit when no API base URL
// ---------------------------------------------------------------------------

describe('reportError — no API URL', () => {
  it('does not call fetch when data-api-url attribute is absent', () => {
    setupDom(null) // attribute returns null
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error', message: 'boom' })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not call fetch when data-api-url is an empty string', () => {
    setupDom('') // attribute returns ''
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error', message: 'boom' })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Endpoint construction and required fields
// ---------------------------------------------------------------------------

describe('reportError — endpoint and type field', () => {
  it('POSTs to {apiUrl}/admin/client-events', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error' })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/admin/client-events')
  })

  it('always includes the type field in the payload', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'react-error' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.type).toBe('react-error')
  })

  it('uses Content-Type: application/json and method POST', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('sets keepalive: true so the request survives navigation', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.keepalive).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Optional field forwarding
// ---------------------------------------------------------------------------

describe('reportError — optional field forwarding', () => {
  it('includes message when provided', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error', message: 'Something broke' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.message).toBe('Something broke')
  })

  it('omits message key when not provided', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect('message' in body).toBe(false)
  })

  it('forwards method, path, and status for fetch-error', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'fetch-error', method: 'GET', path: '/v1/listings', status: 500 })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.method).toBe('GET')
    expect(body.path).toBe('/v1/listings')
    expect(body.status).toBe(500)
  })

  it('forwards requestId when provided', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error', requestId: 'req-123' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.requestId).toBe('req-123')
  })

  it('forwards componentStack when provided', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'react-error', componentStack: '\n    in App\n    in Root' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.componentStack).toBe('\n    in App\n    in Root')
  })
})

// ---------------------------------------------------------------------------
// URL field: always uses window.location.href
// ---------------------------------------------------------------------------

describe('reportError — url field resolution', () => {
  it('uses window.location.href as the url field, ignoring event.url', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    // Pass a different url on the event — it should be overridden by window.location.href
    reportError({ type: 'js-error', url: 'http://old-page/path' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.url).toBe('http://localhost:3000/current-page')
  })

  it('omits url when window is not defined and event.url is not provided', () => {
    vi.unstubAllGlobals()
    // Restore document with a valid apiUrl so the early-exit guard passes
    const body = { getAttribute: vi.fn(() => 'http://api.test') }
    vi.stubGlobal('document', { body })
    // No window stub — window is undefined

    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    reportError({ type: 'js-error', message: 'server render' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>
    expect('url' in parsed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Stack / componentStack trimming at 4 KB
// ---------------------------------------------------------------------------

describe('reportError — payload size limits', () => {
  it('trims stack to 4096 characters', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    const longStack = 'a'.repeat(5000)
    reportError({ type: 'js-error', stack: longStack })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect((body.stack as string).length).toBe(4096)
  })

  it('does not trim stack shorter than 4096 characters', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    const shortStack = 'Error\n    at foo.js:1:1'
    reportError({ type: 'js-error', stack: shortStack })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.stack).toBe(shortStack)
  })

  it('trims componentStack to 4096 characters', () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    const longStack = '\n    in '.repeat(600)
    reportError({ type: 'react-error', componentStack: longStack })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect((body.componentStack as string).length).toBe(4096)
  })
})

// ---------------------------------------------------------------------------
// Error resilience — fetch failures must be silently swallowed
// ---------------------------------------------------------------------------

describe('reportError — error resilience', () => {
  it('does not throw when fetch rejects', () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'))
    vi.stubGlobal('fetch', mockFetch)

    expect(() => reportError({ type: 'js-error', message: 'err' })).not.toThrow()
  })

  it('does not throw when fetch throws synchronously', () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      throw new Error('Synchronous fetch failure')
    })
    vi.stubGlobal('fetch', mockFetch)

    expect(() => reportError({ type: 'js-error', message: 'err' })).not.toThrow()
  })
})
