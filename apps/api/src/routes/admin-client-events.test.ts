import Fastify, { type FastifyBaseLogger } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminClientEventsRoutes } from './admin-client-events.js'

function buildTestApp() {
  const app = Fastify({ logger: false })
  void app.register(adminClientEventsRoutes)
  return app
}

// ---------------------------------------------------------------------------
// Spy logger helpers — mirrors the pattern in app.test.ts
// ---------------------------------------------------------------------------

type LogEntry = { level: string; args: unknown[] }

function makeSpyLogger(): { loggerInstance: FastifyBaseLogger; entries: LogEntry[] } {
  const entries: LogEntry[] = []
  const makeMethod = (level: string) =>
    (...args: unknown[]) => void entries.push({ level, args })

  const makeLogger = (): FastifyBaseLogger => {
    const logger: FastifyBaseLogger = {
      level: 'info',
      info: makeMethod('info') as FastifyBaseLogger['info'],
      error: makeMethod('error') as FastifyBaseLogger['error'],
      warn: makeMethod('warn') as FastifyBaseLogger['warn'],
      debug: makeMethod('debug') as FastifyBaseLogger['debug'],
      fatal: makeMethod('fatal') as FastifyBaseLogger['fatal'],
      trace: makeMethod('trace') as FastifyBaseLogger['trace'],
      silent: makeMethod('silent') as FastifyBaseLogger['silent'],
      child: () => makeLogger(),
    }
    return logger
  }

  return { loggerInstance: makeLogger(), entries }
}

function buildSpyApp() {
  const { loggerInstance, entries } = makeSpyLogger()
  const app = Fastify({ loggerInstance, disableRequestLogging: true })
  void app.register(adminClientEventsRoutes)
  return { app, entries }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /', () => {
  it('returns 204 for a valid js-error event', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        type: 'js-error',
        message: 'Cannot read properties of undefined',
        stack: 'TypeError: Cannot read properties of undefined\n    at foo.js:1:1',
        url: 'http://localhost:3000/',
      },
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 204 for a valid react-error event', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        type: 'react-error',
        message: 'Minified React error #130',
        stack: 'Error: Minified React error\n    at App.tsx:10',
        componentStack: '\n    in Foo\n    in App',
      },
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 204 for a valid fetch-error event', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        type: 'fetch-error',
        message: 'GET /v1/listings → 500',
        method: 'GET',
        path: '/v1/listings',
        status: 500,
        url: 'http://localhost:3000/listings',
      },
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 204 for a valid unhandled-rejection event', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        type: 'unhandled-rejection',
        message: 'Promise rejected without a reason',
      },
    })
    expect(res.statusCode).toBe(204)
  })

  it('accepts a requestId field and returns 204', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: {
        type: 'js-error',
        message: 'Something broke',
        requestId: 'aaaabbbb-1111-2222-3333-444455556666',
      },
    })
    expect(res.statusCode).toBe(204)
  })

  it('returns 400 when type is missing', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { message: 'No type field' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when type is not a recognised value', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'unknown-type', message: 'Bad type' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 204 and strips unknown fields (additionalProperties:false removes, not rejects)', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'js-error', message: 'ok', unknownField: 'stripped' },
    })
    // Fastify strips unknown properties rather than rejecting; the request succeeds
    expect(res.statusCode).toBe(204)
  })

  it('returns 204 with only the required type field', async () => {
    const app = buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'fetch-error' },
    })
    expect(res.statusCode).toBe(204)
  })
})

describe('POST / — log level routing', () => {
  it('logs at error level for js-error events', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'js-error', message: 'boom' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('error')
    expect(loggedLevels).not.toContain('warn')
  })

  it('logs at error level for react-error events', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'react-error', message: 'render error', componentStack: '\n    in App' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('error')
    expect(loggedLevels).not.toContain('warn')
  })

  it('logs at error level for unhandled-rejection events', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'unhandled-rejection', message: 'promise rejected' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('error')
    expect(loggedLevels).not.toContain('warn')
  })

  it('logs at error level for fetch-error with status >= 500', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'fetch-error', status: 500, method: 'GET', path: '/v1/listings' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('error')
    expect(loggedLevels).not.toContain('warn')
  })

  it('logs at warn level for fetch-error with status < 500 (client error)', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'fetch-error', status: 404, method: 'GET', path: '/v1/listings/999' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('warn')
    expect(loggedLevels).not.toContain('error')
  })

  it('logs at warn level for fetch-error with status 400', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'fetch-error', status: 400, method: 'POST', path: '/v1/intake' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('warn')
    expect(loggedLevels).not.toContain('error')
  })

  it('logs at error level for fetch-error with no status (undefined)', async () => {
    // When status is absent, the level expression evaluates status as undefined,
    // so `status < 500` is false and the event logs at error level.
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'fetch-error' },
    })
    const loggedLevels = entries.map((e) => e.level)
    expect(loggedLevels).toContain('error')
    expect(loggedLevels).not.toContain('warn')
  })
})

describe('POST / — log payload content', () => {
  it('uses [type] as fallback message when message field is absent', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'js-error' },
    })
    const errorEntry = entries.find((e) => e.level === 'error')
    expect(errorEntry).toBeDefined()
    // The second arg to req.log.error() is the message string
    const loggedMessage = errorEntry?.args[1]
    expect(loggedMessage).toBe('[js-error]')
  })

  it('logs the service label as web-client for Loki filter', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'react-error', message: 'crash' },
    })
    const errorEntry = entries.find((e) => e.level === 'error')
    const payload = errorEntry?.args[0] as Record<string, unknown>
    expect(payload.service).toBe('web-client')
  })

  it('maps url field to clientUrl in the log payload', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'js-error', message: 'err', url: 'http://localhost:3000/listings' },
    })
    const errorEntry = entries.find((e) => e.level === 'error')
    const payload = errorEntry?.args[0] as Record<string, unknown>
    expect(payload.clientUrl).toBe('http://localhost:3000/listings')
    // The raw `url` key should not appear — it gets aliased to clientUrl
    expect(payload.url).toBeUndefined()
  })

  it('omits optional fields from the log payload when not provided', async () => {
    const { app, entries } = buildSpyApp()
    await app.inject({
      method: 'POST',
      url: '/',
      payload: { type: 'unhandled-rejection' },
    })
    const entry = entries.find((e) => e.level === 'error')
    const payload = entry?.args[0] as Record<string, unknown>
    expect(payload.stack).toBeUndefined()
    expect(payload.method).toBeUndefined()
    expect(payload.path).toBeUndefined()
    expect(payload.status).toBeUndefined()
    expect(payload.requestId).toBeUndefined()
    expect(payload.clientUrl).toBeUndefined()
    expect(payload.componentStack).toBeUndefined()
  })
})
