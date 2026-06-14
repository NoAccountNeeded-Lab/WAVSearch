import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, EventHint } from '@sentry/node'

// ── Sentry mock ──────────────────────────────────────────────────────────────

interface CapturedInit {
  dsn?: string
  environment?: string
  tracesSampleRate?: number
  beforeBreadcrumb?: (breadcrumb: TestBreadcrumb) => TestBreadcrumb | null
  beforeSend?: (event: Event, hint: EventHint) => Event | null | Promise<Event | null>
}

interface TestBreadcrumb {
  message?: string
  data?: Record<string, unknown>
}

let capturedInit: CapturedInit | undefined

vi.mock('@sentry/node', () => ({
  init: vi.fn((opts: CapturedInit) => {
    capturedInit = opts
  }),
}))

function getInit(): CapturedInit {
  if (!capturedInit) throw new Error('Sentry.init was not called')
  return capturedInit
}

function getBeforeSend(): (event: Event, hint: EventHint) => Event | null {
  const init = getInit()
  if (!init.beforeSend) throw new Error('beforeSend not registered')
  return init.beforeSend as (event: Event, hint: EventHint) => Event | null
}

function getBeforeBreadcrumb(): (breadcrumb: TestBreadcrumb) => TestBreadcrumb | null {
  const init = getInit()
  if (!init.beforeBreadcrumb) throw new Error('beforeBreadcrumb not registered')
  return init.beforeBreadcrumb
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('scraper sentry init (beforeSend / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces a VIN in event.message', () => {
    const event: Event = { message: 'Scrape error on 1HGBH41JXMN109186' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('Scrape error on [VIN]')
  })

  it('replaces a VIN in exception value', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'Error', value: 'Cannot parse 1HGBH41JXMN109186' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBe('Cannot parse [VIN]')
  })

  it('removes ip_address from event.user (defence-in-depth)', () => {
    const event: Event = { user: { id: 'worker-1', ip_address: '10.0.0.1' } }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user?.ip_address).toBeUndefined()
    expect(result?.user?.id).toBe('worker-1')
  })

  it('removes IP forwarding headers from event.request.headers', () => {
    const event: Event = {
      request: {
        headers: {
          'x-forwarded-for': '203.0.113.10',
          'X-Real-IP': '203.0.113.11',
          'cf-connecting-ip': '203.0.113.12',
          forwarded: 'for=203.0.113.13',
          'user-agent': 'vitest',
        },
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.request?.headers?.['x-forwarded-for']).toBeUndefined()
    expect(result?.request?.headers?.['X-Real-IP']).toBeUndefined()
    expect(result?.request?.headers?.['cf-connecting-ip']).toBeUndefined()
    expect(result?.request?.headers?.['forwarded']).toBeUndefined()
    expect(result?.request?.headers?.['user-agent']).toBe('vitest')
  })

  it('removes dealer contact fields from event.extra', () => {
    const event: Event = {
      extra: {
        email: 'dealer@example.com',
        phone: '555-0000',
        dealer_email: 'd@d.com',
        dealer_phone: '555-1111',
        contact: 'Jane',
        listingId: 42,
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.extra?.['email']).toBeUndefined()
    expect(result?.extra?.['phone']).toBeUndefined()
    expect(result?.extra?.['dealer_email']).toBeUndefined()
    expect(result?.extra?.['dealer_phone']).toBeUndefined()
    expect(result?.extra?.['contact']).toBeUndefined()
    expect(result?.extra?.['listingId']).toBe(42)
  })

  it('returns the mutated event', () => {
    const event: Event = { message: 'ok' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBe(event)
  })

  it('handles event with no message, exception, user, or extra', () => {
    const event: Event = {}
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBeDefined()
  })
})

describe('scraper sentry init (beforeBreadcrumb / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces VINs in breadcrumb messages and URLs', () => {
    const breadcrumb: TestBreadcrumb = {
      message: 'Fetched listing 1HGBH41JXMN109186',
      data: { url: 'https://dealer.example/listings/1HGBH41JXMN109186' },
    }
    const result = getBeforeBreadcrumb()(breadcrumb)
    expect(result?.message).toBe('Fetched listing [VIN]')
    expect(result?.data?.['url']).toBe('https://dealer.example/listings/[VIN]')
  })
})

describe('scraper sentry init options', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sets tracesSampleRate to 1.0 outside production', () => {
    expect(getInit().tracesSampleRate).toBe(1.0)
  })

  it('sets tracesSampleRate to 0.1 in production', async () => {
    capturedInit = undefined
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await import('./sentry.js')
      expect(getInit().tracesSampleRate).toBe(0.1)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('sets environment from NODE_ENV', async () => {
    capturedInit = undefined
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'staging')
    try {
      await import('./sentry.js')
      expect(getInit().environment).toBe('staging')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
