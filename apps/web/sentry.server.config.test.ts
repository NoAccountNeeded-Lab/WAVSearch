import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, EventHint } from '@sentry/nextjs'

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

vi.mock('@sentry/nextjs', () => ({
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

describe('web server sentry config (beforeSend / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.server.config.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces a VIN in event.message', () => {
    const event: Event = { message: 'Server error VIN 1HGBH41JXMN109186 missing' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('Server error VIN [VIN] missing')
  })

  it('replaces a VIN in exception value', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'Error', value: 'Record 1HGBH41JXMN109186 not found' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBe('Record [VIN] not found')
  })

  it('removes ip_address from event.user on server-side requests', () => {
    const event: Event = { user: { email: 'a@b.com', ip_address: '192.168.1.1' } }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user?.ip_address).toBeUndefined()
    expect(result?.user?.email).toBe('a@b.com')
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
        email: 'e@e.com',
        phone: '555-0001',
        dealer_email: 'd@e.com',
        dealer_phone: '555-0002',
        contact: 'Rep Name',
        requestMethod: 'GET',
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.extra?.['email']).toBeUndefined()
    expect(result?.extra?.['phone']).toBeUndefined()
    expect(result?.extra?.['dealer_email']).toBeUndefined()
    expect(result?.extra?.['dealer_phone']).toBeUndefined()
    expect(result?.extra?.['contact']).toBeUndefined()
    expect(result?.extra?.['requestMethod']).toBe('GET')
  })

  it('returns the mutated event', () => {
    const event: Event = { message: 'server ok' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBe(event)
  })

  it('handles empty event gracefully', () => {
    const event: Event = {}
    expect(getBeforeSend()(event, {} as EventHint)).toBeDefined()
  })
})

describe('web server sentry config (beforeBreadcrumb / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.server.config.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces VINs in breadcrumb messages and URLs', () => {
    const breadcrumb: TestBreadcrumb = {
      message: 'GET /v1/vin/1HGBH41JXMN109186',
      data: { url: 'https://web.example/v1/vin/1HGBH41JXMN109186' },
    }
    const result = getBeforeBreadcrumb()(breadcrumb)
    expect(result?.message).toBe('GET /v1/vin/[VIN]')
    expect(result?.data?.['url']).toBe('https://web.example/v1/vin/[VIN]')
  })
})

describe('web server sentry init options', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.server.config.js')
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
      await import('./sentry.server.config.js')
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
      await import('./sentry.server.config.js')
      expect(getInit().environment).toBe('staging')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
