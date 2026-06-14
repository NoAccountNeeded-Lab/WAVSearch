import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, EventHint } from '@sentry/node'

// ── Sentry mock ──────────────────────────────────────────────────────────────
// We capture the options passed to Sentry.init so we can invoke beforeSend
// directly and test the PII-scrubbing logic without a real Sentry connection.

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

// ── Helpers ──────────────────────────────────────────────────────────────────

// Reads capturedInit via a function call to break TypeScript's control-flow
// narrowing after `capturedInit = undefined` assignments inside test cases.
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

describe('API sentry init (beforeSend / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    // Import the module under test — the side-effect calls Sentry.init
    await import('./sentry.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── VIN scrubbing ──────────────────────────────────────────────────────────

  it('replaces a VIN in event.message', () => {
    const event: Event = { message: 'Failed to process 1HGBH41JXMN109186 today' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('Failed to process [VIN] today')
  })

  it('replaces multiple VINs in event.message', () => {
    const event: Event = { message: '1HGBH41JXMN109186 and 2T1BURHE0JC074659' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('[VIN] and [VIN]')
  })

  it('leaves a 16-character string unmodified (not a VIN)', () => {
    const event: Event = { message: 'error ref ABCD1234EFGH567' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('error ref ABCD1234EFGH567')
  })

  it('leaves an 18-character string unmodified (not a VIN)', () => {
    const event: Event = { message: 'ref 1HGBH41JXMN1091860' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('ref 1HGBH41JXMN1091860')
  })

  it('replaces a VIN in exception value', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'Error', value: 'VIN 1HGBH41JXMN109186 is invalid' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBe('VIN [VIN] is invalid')
  })

  it('handles event with no message and no exception gracefully', () => {
    const event: Event = {}
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBeDefined()
  })

  it('handles exception values with undefined value property', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'Error' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBeUndefined()
  })

  // ── IP address removal ─────────────────────────────────────────────────────

  it('removes ip_address from event.user', () => {
    const event: Event = { user: { id: 'u1', ip_address: '1.2.3.4' } }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user?.ip_address).toBeUndefined()
    expect(result?.user?.id).toBe('u1')
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

  it('leaves event.user intact when ip_address is absent', () => {
    const event: Event = { user: { id: 'u2' } }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user?.id).toBe('u2')
  })

  it('handles events with no user', () => {
    const event: Event = { message: 'hello' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user).toBeUndefined()
  })

  // ── Dealer contact field removal ───────────────────────────────────────────

  it('removes sensitive keys from event.extra', () => {
    const event: Event = {
      extra: {
        email: 'dealer@example.com',
        phone: '555-1234',
        dealer_email: 'contact@dealer.com',
        dealer_phone: '555-5678',
        contact: 'John Smith',
        safeField: 'keep-me',
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.extra?.['email']).toBeUndefined()
    expect(result?.extra?.['phone']).toBeUndefined()
    expect(result?.extra?.['dealer_email']).toBeUndefined()
    expect(result?.extra?.['dealer_phone']).toBeUndefined()
    expect(result?.extra?.['contact']).toBeUndefined()
    expect(result?.extra?.['safeField']).toBe('keep-me')
  })

  it('handles events with no extra', () => {
    const event: Event = { message: 'no extras here' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.extra).toBeUndefined()
  })

  // ── Return value ───────────────────────────────────────────────────────────

  it('returns the mutated event (not null)', () => {
    const event: Event = { message: 'ok' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).not.toBeNull()
    expect(result).toBe(event)
  })
})

describe('API sentry init (beforeBreadcrumb / PII scrubbing)', () => {
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
      message: 'GET /v1/vin/1HGBH41JXMN109186/safety',
      data: { url: 'https://api.example.com/v1/vin/1HGBH41JXMN109186/safety' },
    }
    const result = getBeforeBreadcrumb()(breadcrumb)
    expect(result?.message).toBe('GET /v1/vin/[VIN]/safety')
    expect(result?.data?.['url']).toBe('https://api.example.com/v1/vin/[VIN]/safety')
  })
})

describe('API sentry init options', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sets tracesSampleRate to 1.0 outside production', () => {
    // Test environment is not production
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
