import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, EventHint } from '@sentry/nextjs'

// ── Sentry mock ──────────────────────────────────────────────────────────────

interface CapturedInit {
  dsn?: string
  environment?: string
  tracesSampleRate?: number
  beforeSend?: (event: Event, hint: EventHint) => Event | null | Promise<Event | null>
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('web edge sentry config (beforeSend / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.edge.config.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces a VIN in event.message', () => {
    const event: Event = { message: 'Edge middleware error 1HGBH41JXMN109186' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('Edge middleware error [VIN]')
  })

  it('replaces multiple VINs in event.message', () => {
    const event: Event = { message: '1HGBH41JXMN109186 and 2T1BURHE0JC074659' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('[VIN] and [VIN]')
  })

  it('replaces a VIN in exception value', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'TypeError', value: 'Invalid VIN: 1HGBH41JXMN109186' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBe('Invalid VIN: [VIN]')
  })

  it('handles exception value that is undefined', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'TypeError' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBeUndefined()
  })

  it('removes ip_address from event.user', () => {
    const event: Event = { user: { id: 'edge-worker', ip_address: '2001:db8::1' } }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user?.ip_address).toBeUndefined()
    expect(result?.user?.id).toBe('edge-worker')
  })

  it('removes sensitive dealer contact fields from event.extra', () => {
    const event: Event = {
      extra: {
        email: 'dealer@example.com',
        phone: '555-0100',
        dealer_email: 'sales@dealer.com',
        dealer_phone: '555-0101',
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

  it('handles empty event gracefully', () => {
    const event: Event = {}
    expect(getBeforeSend()(event, {} as EventHint)).toBeDefined()
  })

  it('returns the mutated event', () => {
    const event: Event = { message: 'edge ok' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBe(event)
  })
})

describe('web edge sentry init options', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.edge.config.js')
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
      await import('./sentry.edge.config.js')
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
      await import('./sentry.edge.config.js')
      expect(getInit().environment).toBe('staging')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
