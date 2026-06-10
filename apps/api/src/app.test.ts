import Fastify, { type FastifyBaseLogger } from 'fastify'
import { MockQueueFactory } from '@wivwav/queue'
import { describe, expect, it, vi } from 'vitest'
import { buildApp, isAllowedCorsOrigin } from './app.js'
import type { Config } from './config.js'

const baseConfig: Config = {
  NODE_ENV: 'production',
  PORT: 3001,
  HOST: '0.0.0.0',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/wivwav',
  MEILISEARCH_HOST: 'http://localhost:7700',
  MEILISEARCH_API_KEY: 'test',
  VALKEY_URL: 'redis://localhost:6379',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_REQUIRED: false,
  LOKI_URL: 'http://localhost:3100',
  CORS_ORIGIN: ['http://localhost:3000'],
}

describe('isAllowedCorsOrigin', () => {
  it('allows explicitly configured origins', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', baseConfig)).toBe(true)
  })

  it('allows arbitrary localhost ports in development', () => {
    expect(isAllowedCorsOrigin('http://localhost:3002', {
      ...baseConfig,
      NODE_ENV: 'development',
    })).toBe(true)
  })

  it('does not allow arbitrary origins outside development', () => {
    expect(isAllowedCorsOrigin('http://localhost:3002', baseConfig)).toBe(false)
    expect(isAllowedCorsOrigin('https://example.com', {
      ...baseConfig,
      NODE_ENV: 'development',
    })).toBe(false)
  })
})

function buildTestApp() {
  const search = {
    search: vi.fn(async () => ({ hits: [], total: 0, facets: {} })),
    syncAll: vi.fn(async () => 7),
  }
  const facets = {
    getFacets: vi.fn(async () => ({
      total: 0,
      priceDistribution: [],
      yearDistribution: [],
      mileageDistribution: [],
      makeBreakdown: [],
      modelBreakdown: [],
      stateBreakdown: [],
      conditionBreakdown: [],
      conversionBreakdown: [],
      colorBreakdown: [],
      wavFeatures: { hasLift: 0, handControls: 0, rampTypes: [] },
    })),
  }
  const queueFactory = new MockQueueFactory() as MockQueueFactory & { getBullMQQueues: () => [] }
  queueFactory.getBullMQQueues = () => []

  return {
    search,
    app: buildApp(
      { ...baseConfig, NODE_ENV: 'test' },
      {
        listing: {
          findMany: vi.fn(async () => []),
          count: vi.fn(async () => 0),
          findUnique: vi.fn(async () => null),
        },
        source: {
          findMany: vi.fn(async () => []),
          findUnique: vi.fn(async () => null),
        },
        scraperRun: {
          findMany: vi.fn(async () => []),
        },
      } as never,
      {} as never,
      {} as never,
      search as never,
      facets as never,
      queueFactory as never,
    ),
  }
}

describe('CORS methods', () => {
  it('allows PUT, PATCH, and DELETE via CORS preflight', async () => {
    const { app: appPromise } = buildTestApp()
    const app = await appPromise

    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/v1/listings',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': method,
        },
      })
      // CORS preflight should reply 204 and expose the requested method
      expect(response.statusCode).toBe(204)
      const allowedMethods = response.headers['access-control-allow-methods'] as string
      expect(allowedMethods).toContain(method)
    }

    await app.close()
  })

  it('does not set CORS headers for a disallowed origin', async () => {
    const { app: appPromise } = buildTestApp()
    const app = await appPromise

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/listings',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'GET',
      },
    })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()

    await app.close()
  })
})

// ---------------------------------------------------------------------------
// Helpers for log-capture tests
// ---------------------------------------------------------------------------

type LogEntry = { level: string; args: unknown[] }

/**
 * Creates a spy-based Fastify logger that records all calls in `entries`.
 * Passed via `loggerInstance` so request.log (a child of this) is captured.
 */
function makeSpyLogger(): { loggerInstance: FastifyBaseLogger; entries: LogEntry[] } {
  const entries: LogEntry[] = []

  const makeMethod = (level: string) =>
    (...args: unknown[]) => void entries.push({ level, args })

  // `child` must return a new logger that also records to the same entries array
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

/**
 * Creates a Fastify instance wired with the same onResponse hook and
 * setErrorHandler that buildApp registers. Uses a spy logger so log calls
 * are captured without a real pino/stream dependency.
 */
function buildMinimalLoggingApp() {
  const { loggerInstance, entries } = makeSpyLogger()
  const app = Fastify({ loggerInstance, disableRequestLogging: true })

  // Replicate the onResponse hook from app.ts
  app.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      method: request.method,
      url: request.routeOptions.url ?? request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    }, 'request completed')
    done()
  })

  // Replicate the setErrorHandler from app.ts
  app.setErrorHandler((error, request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error')
    }
    void reply.code(statusCode).send(error)
  })

  return { app, entries }
}

describe('onResponse hook', () => {
  it('does not break a successful response', async () => {
    const { app } = buildTestApp()
    const built = await app

    const response = await built.inject({ method: 'GET', url: '/v1/listings' })
    expect(response.statusCode).toBe(200)

    await built.close()
  })

  it('logs method, url, statusCode, and durationMs on each response', async () => {
    const { app, entries } = buildMinimalLoggingApp()
    app.get('/ping', async () => ({ ok: true }))
    await app.ready()

    await app.inject({ method: 'GET', url: '/ping' })

    const completedEntry = entries.find(
      (e) => e.level === 'info' && (e.args[1] as string) === 'request completed',
    )
    expect(completedEntry).toBeDefined()
    const fields = completedEntry!.args[0] as Record<string, unknown>
    expect(fields['method']).toBe('GET')
    expect(fields['url']).toBe('/ping')
    expect(fields['statusCode']).toBe(200)
    expect(typeof fields['durationMs']).toBe('number')

    await app.close()
  })

  it('uses routeOptions.url (the route pattern) rather than the raw request URL', async () => {
    const { app, entries } = buildMinimalLoggingApp()
    app.get('/items/:id', async () => ({ ok: true }))
    await app.ready()

    await app.inject({ method: 'GET', url: '/items/abc-123' })

    const completedEntry = entries.find(
      (e) => e.level === 'info' && (e.args[1] as string) === 'request completed',
    )
    // The logged url must be the route pattern, not the concrete request path
    const fields = completedEntry!.args[0] as Record<string, unknown>
    expect(fields['url']).toBe('/items/:id')

    await app.close()
  })
})

describe('setErrorHandler', () => {
  it('passes through 4xx errors with the correct status code', async () => {
    const { app: appPromise } = buildTestApp()
    const app = await appPromise

    // The listings/:id route returns 404 when the listing is not found
    const response = await app.inject({ method: 'GET', url: '/v1/listings/nonexistent-id' })
    expect(response.statusCode).toBe(404)

    await app.close()
  })

  it('returns 500 for unhandled errors thrown in a handler', async () => {
    const { app: appPromise } = buildTestApp()
    const app = await appPromise

    app.get('/test-500', async () => {
      throw new Error('boom')
    })

    const response = await app.inject({ method: 'GET', url: '/test-500' })
    expect(response.statusCode).toBe(500)

    await app.close()
  })

  it('logs "unhandled error" at error level for 5xx', async () => {
    const { app, entries } = buildMinimalLoggingApp()
    app.get('/explode', async () => {
      throw new Error('kaboom')
    })
    await app.ready()

    await app.inject({ method: 'GET', url: '/explode' })

    const errorEntry = entries.find(
      (e) => e.level === 'error' && (e.args[1] as string) === 'unhandled error',
    )
    expect(errorEntry).toBeDefined()
    const fields = errorEntry!.args[0] as Record<string, unknown>
    expect(fields['err']).toBeInstanceOf(Error)

    await app.close()
  })

  it('does not log "unhandled error" for 4xx errors', async () => {
    const { app, entries } = buildMinimalLoggingApp()
    const err4xx = Object.assign(new Error('not found'), { statusCode: 404 })
    app.get('/not-found', async () => {
      throw err4xx
    })
    await app.ready()

    await app.inject({ method: 'GET', url: '/not-found' })

    const errorEntries = entries.filter(
      (e) => e.level === 'error' && (e.args[1] as string) === 'unhandled error',
    )
    expect(errorEntries).toHaveLength(0)

    await app.close()
  })
})

describe('rate limiting', () => {
  it('applies the global request limit to listing search', async () => {
    const { app: appPromise } = buildTestApp()
    const app = await appPromise

    for (let i = 0; i < 100; i++) {
      const response = await app.inject({ method: 'GET', url: '/v1/listings' })
      expect(response.statusCode).toBe(200)
    }

    const limited = await app.inject({ method: 'GET', url: '/v1/listings' })
    expect(limited.statusCode).toBe(429)

    await app.close()
  })

  it('uses a tighter limit for admin sync', async () => {
    const { app: appPromise, search } = buildTestApp()
    const app = await appPromise

    for (let i = 0; i < 5; i++) {
      const response = await app.inject({ method: 'POST', url: '/admin/sync' })
      expect(response.statusCode).toBe(200)
    }

    const limited = await app.inject({ method: 'POST', url: '/admin/sync' })
    expect(limited.statusCode).toBe(429)
    expect(search.syncAll).toHaveBeenCalledTimes(5)

    await app.close()
  })
})
