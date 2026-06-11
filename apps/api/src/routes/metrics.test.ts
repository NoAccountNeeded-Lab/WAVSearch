import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { describe, expect, it, vi } from 'vitest'
import { MockQueueFactory } from '@wivwav/queue'
import { metricsRoutes, createMetricsRegistry } from './metrics.js'

function buildTestApp() {
  const db = {
    $queryRaw: vi.fn(async () => [{ size: BigInt(1024 * 1024) }]),
    listing: { count: vi.fn(async () => 42) },
  }

  const cache = {
    status: 'ready' as const,
    ping: vi.fn(async () => 'PONG'),
    connect: vi.fn(),
  }

  const meili = {
    health: vi.fn(async () => ({ status: 'available' as const })),
  }

  const queueFactory = new MockQueueFactory()
  const { registry, httpRequests, httpDuration } = createMetricsRegistry()

  const app = Fastify()

  // Mirror the root-level hook from app.ts so the counter test works in isolation
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions.url ?? 'unknown'
    const method = request.method
    const statusClass = `${Math.floor(reply.statusCode / 100)}xx`
    httpRequests.labels(method, route, statusClass).inc()
    httpDuration.labels(method, route).observe(Math.round(reply.elapsedTime))
    done()
  })

  void app.register(sensible)
  void app.register(metricsRoutes, {
    db: db as never,
    cache: cache as never,
    meili: meili as never,
    queueFactory: queueFactory as never,
    registry,
    httpRequests,
    httpDuration,
  })

  return { app, db, cache, meili }
}

describe('GET /metrics', () => {
  it('returns Prometheus text format with 200', async () => {
    const { app } = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/plain/)
    // Default prom-client metrics are always present
    expect(res.payload).toContain('nodejs_heap_size_used_bytes')
  })

  it('includes custom WivWav metric names', async () => {
    const { app } = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toContain('wivwav_db_up')
    expect(res.payload).toContain('wivwav_valkey_up')
    expect(res.payload).toContain('wivwav_meilisearch_up')
    expect(res.payload).toContain('wivwav_db_size_bytes')
    expect(res.payload).toContain('wivwav_db_listing_count')
    expect(res.payload).toContain('wivwav_queue_depth')
  })

  it('reports db_up=1 when postgres is reachable', async () => {
    const { app, db } = buildTestApp()
    // The $queryRaw returns [{ size }] for the size query — SELECT 1 is also called
    db.$queryRaw.mockResolvedValue([{ size: BigInt(2048) }])
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toMatch(/wivwav_db_up\s+1/)
  })

  it('reports db_up=0 when postgres throws', async () => {
    const { app, db } = buildTestApp()
    db.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toMatch(/wivwav_db_up\s+0/)
  })

  it('reports valkey_up=0 when cache throws', async () => {
    const { app, cache } = buildTestApp()
    cache.ping.mockRejectedValue(new Error('timeout'))
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toMatch(/wivwav_valkey_up\s+0/)
  })

  it('reports meilisearch_up=0 when health check throws', async () => {
    const { app, meili } = buildTestApp()
    meili.health.mockRejectedValue(new Error('unavailable'))
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toMatch(/wivwav_meilisearch_up\s+0/)
  })

  it('increments http request counter on each call', async () => {
    const { app } = buildTestApp()
    // Two scrapes — counter should show 2 by the second response
    await app.inject({ method: 'GET', url: '/' })
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    const match = res.payload.match(/wivwav_http_requests_total\{[^}]+\}\s+(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(1)
  })

  it('emits http request duration histogram', async () => {
    const { app } = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toContain('wivwav_http_request_duration_ms')
  })

  it('reports db_size_bytes and db_listing_count with correct values', async () => {
    const { app, db } = buildTestApp()
    // First call: SELECT 1 probe (result discarded), second call: pg_database_size query
    db.$queryRaw
      .mockResolvedValueOnce([{ '?column?': 1 }] as never)
      .mockResolvedValueOnce([{ size: BigInt(8192) }])
    db.listing.count.mockResolvedValue(99)
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toMatch(/wivwav_db_size_bytes\s+8192/)
    expect(res.payload).toMatch(/wivwav_db_listing_count\s+99/)
  })

  it('calls cache.connect() when status is "wait"', async () => {
    const app = Fastify()
    void app.register(sensible)

    const db = {
      $queryRaw: vi.fn(async () => [{ size: BigInt(1024) }]),
      listing: { count: vi.fn(async () => 0) },
    }
    const cache = {
      status: 'wait' as const,
      ping: vi.fn(async () => 'PONG'),
      connect: vi.fn(async () => undefined),
    }
    const meili = {
      health: vi.fn(async () => ({ status: 'available' as const })),
    }
    const { registry, httpRequests, httpDuration } = createMetricsRegistry()
    void app.register(metricsRoutes, {
      db: db as never,
      cache: cache as never,
      meili: meili as never,
      queueFactory: new MockQueueFactory() as never,
      registry,
      httpRequests,
      httpDuration,
    })

    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(cache.connect).toHaveBeenCalledOnce()
    expect(res.payload).toMatch(/wivwav_valkey_up\s+1/)
  })

  it('reports meilisearch_up=0 when health status is not "available"', async () => {
    const { app, meili } = buildTestApp()
    meili.health.mockResolvedValue({ status: 'degraded' as never })
    const res = await app.inject({ method: 'GET', url: '/' })
    await app.close()

    expect(res.payload).toMatch(/wivwav_meilisearch_up\s+0/)
  })
})
