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
