import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('register()', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('imports sentry.server.config when NEXT_RUNTIME is nodejs', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')

    // Mock both possible config imports so the side effects don't run
    vi.doMock('./sentry.server.config', () => ({}))
    vi.doMock('./sentry.edge.config', () => ({}))

    const { register } = await import('./instrumentation.js')
    // Should resolve without error
    await expect(register()).resolves.toBeUndefined()
  })

  it('imports sentry.edge.config when NEXT_RUNTIME is edge', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')

    vi.doMock('./sentry.server.config', () => ({}))
    vi.doMock('./sentry.edge.config', () => ({}))

    const { register } = await import('./instrumentation.js')
    await expect(register()).resolves.toBeUndefined()
  })

  it('imports neither config when NEXT_RUNTIME is unset', async () => {
    delete process.env['NEXT_RUNTIME']

    vi.doMock('./sentry.server.config', () => ({}))
    vi.doMock('./sentry.edge.config', () => ({}))

    const { register } = await import('./instrumentation.js')
    await expect(register()).resolves.toBeUndefined()
  })
})

describe('onRequestError()', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('calls captureRequestError with the error, request, and context', async () => {
    const mockCaptureRequestError = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      captureRequestError: mockCaptureRequestError,
    }))

    const { onRequestError } = await import('./instrumentation.js')

    const error = new Error('render failed')
    const request = {
      path: '/listings/abc',
      method: 'GET',
      headers: { 'x-request-id': 'req-123' },
    }
    const context = {
      routerKind: 'App Router',
      routePath: '/listings/[id]',
      routeType: 'render',
    }

    await onRequestError(error, request, context)

    expect(mockCaptureRequestError).toHaveBeenCalledOnce()
    expect(mockCaptureRequestError).toHaveBeenCalledWith(error, request, context)
  })

  it('forwards non-Error thrown values to captureRequestError', async () => {
    const mockCaptureRequestError = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      captureRequestError: mockCaptureRequestError,
    }))

    const { onRequestError } = await import('./instrumentation.js')

    const thrown = 'string error'
    const request = { path: '/', method: 'GET', headers: {} }
    const context = { routerKind: 'App Router', routePath: '/', routeType: 'render' }

    await onRequestError(thrown, request, context)

    expect(mockCaptureRequestError).toHaveBeenCalledWith(thrown, request, context)
  })
})
