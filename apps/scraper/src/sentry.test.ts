import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, EventHint } from '@sentry/node'

// ── Sentry mock ──────────────────────────────────────────────────────────────

interface CapturedInit {
  dsn?: string
  environment?: string
  tracesSampleRate?: number
  beforeSend?: (event: Event, hint: EventHint) => Event | null | Promise<Event | null>
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
