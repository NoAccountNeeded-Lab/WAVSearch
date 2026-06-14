import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event, EventHint } from '@sentry/nextjs'

// ── Sentry mock ──────────────────────────────────────────────────────────────

interface CapturedInit {
  dsn?: string
  environment?: string
  tracesSampleRate?: number
  replaysSessionSampleRate?: number
  replaysOnErrorSampleRate?: number
  integrations?: unknown[]
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
  replayIntegration: vi.fn(() => 'replay-integration'),
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

describe('web client sentry config (beforeSend / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.client.config.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces a VIN in event.message', () => {
    const event: Event = { message: 'Client error on VIN 1HGBH41JXMN109186' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.message).toBe('Client error on VIN [VIN]')
  })

  it('replaces a VIN in exception value', () => {
    const event: Event = {
      exception: {
        values: [{ type: 'Error', value: '1HGBH41JXMN109186 not found' }],
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.exception?.values?.[0]?.value).toBe('[VIN] not found')
  })

  it('removes ip_address from event.user', () => {
    const event: Event = { user: { id: 'browser-user', ip_address: '203.0.113.1' } }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.user?.ip_address).toBeUndefined()
    expect(result?.user?.id).toBe('browser-user')
  })

  it('removes dealer contact fields from event.extra', () => {
    const event: Event = {
      extra: {
        email: 'x@x.com',
        phone: '555-9999',
        dealer_email: 'dealer@x.com',
        dealer_phone: '555-8888',
        contact: 'Contact Name',
        requestId: 'req-1',
      },
    }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result?.extra?.['email']).toBeUndefined()
    expect(result?.extra?.['phone']).toBeUndefined()
    expect(result?.extra?.['dealer_email']).toBeUndefined()
    expect(result?.extra?.['dealer_phone']).toBeUndefined()
    expect(result?.extra?.['contact']).toBeUndefined()
    expect(result?.extra?.['requestId']).toBe('req-1')
  })

  it('returns the mutated event', () => {
    const event: Event = { message: 'all good' }
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBe(event)
  })

  it('handles empty event gracefully', () => {
    const event: Event = {}
    const result = getBeforeSend()(event, {} as EventHint)
    expect(result).toBeDefined()
  })
})

describe('web client sentry config (beforeBreadcrumb / PII scrubbing)', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.client.config.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('replaces VINs in breadcrumb messages and URLs', () => {
    const breadcrumb: TestBreadcrumb = {
      message: 'Navigation to /v1/vin/1HGBH41JXMN109186',
      data: { url: 'https://app.example/v1/vin/1HGBH41JXMN109186' },
    }
    const result = getBeforeBreadcrumb()(breadcrumb)
    expect(result?.message).toBe('Navigation to /v1/vin/[VIN]')
    expect(result?.data?.['url']).toBe('https://app.example/v1/vin/[VIN]')
  })
})

describe('web client sentry init options', () => {
  beforeEach(async () => {
    capturedInit = undefined
    vi.resetModules()
    await import('./sentry.client.config.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sets replaysSessionSampleRate to 0.01', () => {
    expect(getInit().replaysSessionSampleRate).toBe(0.01)
  })

  it('sets replaysOnErrorSampleRate to 1.0', () => {
    expect(getInit().replaysOnErrorSampleRate).toBe(1.0)
  })

  it('registers the Replay integration', () => {
    expect(getInit().integrations).toContain('replay-integration')
  })

  it('sets tracesSampleRate to 1.0 outside production', () => {
    expect(getInit().tracesSampleRate).toBe(1.0)
  })

  it('sets tracesSampleRate to 0.1 in production', async () => {
    capturedInit = undefined
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await import('./sentry.client.config.js')
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
      await import('./sentry.client.config.js')
      expect(getInit().environment).toBe('staging')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
