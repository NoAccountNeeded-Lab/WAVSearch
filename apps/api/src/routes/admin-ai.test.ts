import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminAiRoutes } from './admin-ai.js'

function buildTestApp(db: unknown) {
  const app = Fastify()
  void app.register(adminAiRoutes, {
    db: db as never,
    ollamaBaseUrl: 'http://ollama.test',
  })
  return app
}

const emptyDb = {
  source: { findMany: vi.fn(async () => []) },
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('GET /status', () => {
  it('returns installed and loaded Ollama model stats', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return Response.json({
          models: [{ name: 'llama3.2:latest', size: 2_016_000_000, modified_at: '2026-05-30T10:00:00Z' }],
        })
      }

      if (url.endsWith('/api/ps')) {
        return Response.json({
          models: [
            {
              model: 'llama3.2:latest',
              size: 2_016_000_000,
              size_vram: 1_920_000_000,
              processor: '100% GPU',
              context: 4096,
              expires_at: '2026-05-30T10:05:00Z',
            },
          ],
        })
      }

      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const app = buildTestApp(emptyDb)
    const res = await app.inject({ method: 'GET', url: '/status' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.ollama).toMatchObject({
      available: true,
      baseUrl: 'http://ollama.test',
      models: ['llama3.2:latest'],
      runningModels: [
        {
          name: 'llama3.2:latest',
          sizeBytes: 2_016_000_000,
          vramBytes: 1_920_000_000,
          processor: '100% GPU',
          contextWindow: 4096,
          expiresAt: '2026-05-30T10:05:00Z',
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith('http://ollama.test/api/tags', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('http://ollama.test/api/ps', expect.any(Object))

    await app.close()
  })

  it('keeps status available when runtime stats cannot be read', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return Response.json({ models: [{ name: 'llama3.2:latest' }] })
      }

      throw new Error('ps failed')
    })
    vi.stubGlobal('fetch', fetchMock)

    const app = buildTestApp(emptyDb)
    const res = await app.inject({ method: 'GET', url: '/status' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.ollama).toMatchObject({
      available: true,
      models: ['llama3.2:latest'],
      runningModels: [],
    })

    await app.close()
  })
})
