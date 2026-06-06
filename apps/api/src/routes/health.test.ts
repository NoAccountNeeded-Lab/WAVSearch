import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { healthRoutes } from './health.js'

const baseConfig = {
  NODE_ENV: 'test' as const,
  PORT: 3001,
  HOST: '127.0.0.1',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/wivwav',
  MEILISEARCH_HOST: 'http://localhost:7700',
  MEILISEARCH_API_KEY: 'test',
  VALKEY_URL: 'redis://localhost:6379',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_REQUIRED: false,
  CORS_ORIGIN: 'http://localhost:3000',
}

const baseDeps = {
  meili: { health: vi.fn(async () => ({ status: 'available' })) } as never,
  cache: { status: 'ready', ping: vi.fn(async () => 'PONG') } as never,
  config: baseConfig,
}

describe('healthRoutes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns ok when all service probes are up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))

    const app = Fastify()
    await app.register(healthRoutes, {
      ...baseDeps,
      db: {
        $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
        source: {
          count: vi.fn(async () => 2),
        },
        scraperRun: {
          findFirst: vi.fn(async () => ({ finishedAt: new Date(Date.now() - 60_000) })),
        },
      } as never,
    })

    const response = await app.inject({ method: 'GET', url: '/' })
    const body = response.json()

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.services.postgres.status).toBe('up')
    expect(body.services.meilisearch.status).toBe('up')
    expect(body.services.valkey.status).toBe('up')
    expect(body.services.ollama.status).toBe('up')
    expect(body.services.scraper.status).toBe('up')
    expect(body.services.scraper.lastRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await app.close()
  })

  it('keeps scraper up before its first successful run when active sources exist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))

    const app = Fastify()
    await app.register(healthRoutes, {
      ...baseDeps,
      db: {
        $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
        source: {
          count: vi.fn(async () => 2),
        },
        scraperRun: {
          findFirst: vi.fn(async () => null),
        },
      } as never,
    })

    const response = await app.inject({ method: 'GET', url: '/' })
    const body = response.json()

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.services.scraper.status).toBe('up')

    await app.close()
  })

  it('reports optional Ollama as offline without failing overall health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connect failed')
    }))

    const app = Fastify()
    await app.register(healthRoutes, {
      ...baseDeps,
      db: {
        $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
        source: {
          count: vi.fn(async () => 2),
        },
        scraperRun: {
          findFirst: vi.fn(async () => null),
        },
      } as never,
    })

    const response = await app.inject({ method: 'GET', url: '/' })
    const body = response.json()

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.services.ollama.status).toBe('optional_offline')
    expect(body.services.ollama.message).toContain('Optional AI remapping')

    await app.close()
  })
})
