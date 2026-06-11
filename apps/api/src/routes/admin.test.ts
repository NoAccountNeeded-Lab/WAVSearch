import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { describe, expect, it, vi } from 'vitest'
import { MockQueueFactory, QUEUES } from '@wivwav/queue'
import type { MockQueueAdapter } from '@wivwav/queue'
import { adminRoutes } from './admin.js'

const mockSearch = { syncAll: vi.fn(async () => 42) }

function buildTestApp(db: unknown, factory: MockQueueFactory, search = mockSearch) {
  const app = Fastify()
  void app.register(sensible)
  void app.register(adminRoutes, { db: db as never, queueFactory: factory as never, search: search as never })
  return app
}

const emptyDb = {
  scraperRun: { findMany: vi.fn(async () => []) },
  source: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
}

describe('GET /queues', () => {
  it('returns all queue names with stats', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)
    const res = await app.inject({ method: 'GET', url: '/queues' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.data)).toBe(true)
    const names = body.data.map((q: { name: string }) => q.name)
    expect(names).toContain(QUEUES.SOURCE_SCRAPE)
    expect(body.data[0]).toMatchObject({ name: expect.any(String), paused: false, stats: expect.any(Object) })
    await app.close()
  })

  it('returns 503 with error envelope when queue service throws', async () => {
    const factory = {
      createQueue: () => ({
        name: QUEUES.SOURCE_SCRAPE,
        isPaused: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        getStats: vi.fn(),
        add: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        getJobs: vi.fn(),
        getRepeatableJobs: vi.fn(),
        addRepeatable: vi.fn(),
        removeRepeatableByKey: vi.fn(),
        close: vi.fn(),
      }),
      createWorker: vi.fn(),
      close: vi.fn(),
    }
    const app = buildTestApp(emptyDb, factory as never)
    const res = await app.inject({ method: 'GET', url: '/queues' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Queue service is unavailable' } })
    await app.close()
  })
})

describe('GET /queues/:name', () => {
  it('returns stats and jobs for a known queue', async () => {
    const factory = new MockQueueFactory()
    factory.createQueue(QUEUES.SOURCE_SCRAPE)
    const app = buildTestApp(emptyDb, factory)
    const res = await app.inject({ method: 'GET', url: `/queues/${QUEUES.SOURCE_SCRAPE}` })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.name).toBe(QUEUES.SOURCE_SCRAPE)
    expect(data.stats).toMatchObject({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })
    expect(Array.isArray(data.jobs)).toBe(true)
    await app.close()
  })

  it('returns 404 for an unknown queue name', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)
    const res = await app.inject({ method: 'GET', url: '/queues/nonexistent' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})

describe('POST /queues/:name/jobs', () => {
  it('enqueues a job and returns its id', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)

    const res = await app.inject({
      method: 'POST',
      url: `/queues/${QUEUES.SOURCE_SCRAPE}/jobs`,
      payload: { data: { sourceId: 'src-1' } },
    })
    expect(res.statusCode).toBe(201)
    const { data } = res.json()
    expect(typeof data.id).toBe('string')
    expect(data.id.length).toBeGreaterThan(0)

    const q = factory.getQueue(QUEUES.SOURCE_SCRAPE) as MockQueueAdapter
    expect(q.getEnqueued()).toHaveLength(1)
    const jobData = q.getEnqueued()[0]!.data as Record<string, unknown>
    expect(jobData['sourceId']).toBe('src-1')
    expect(typeof jobData['traceId']).toBe('string')

    await app.close()
  })

  it('enqueues with empty data when body is omitted', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)

    const res = await app.inject({ method: 'POST', url: `/queues/${QUEUES.GEOCODE}/jobs` })
    expect(res.statusCode).toBe(201)

    const q = factory.getQueue(QUEUES.GEOCODE) as MockQueueAdapter
    expect(q.getEnqueued()).toHaveLength(1)

    await app.close()
  })

  it('rejects non-object job data', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)

    const res = await app.inject({
      method: 'POST',
      url: `/queues/${QUEUES.SOURCE_SCRAPE}/jobs`,
      payload: { data: 'src-1' },
    })

    expect(res.statusCode).toBe(400)
    expect(factory.getQueue(QUEUES.SOURCE_SCRAPE)?.getEnqueued()).toHaveLength(0)

    await app.close()
  })

  it('strips unknown top-level job body fields', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)

    const res = await app.inject({
      method: 'POST',
      url: `/queues/${QUEUES.SOURCE_SCRAPE}/jobs`,
      payload: { sourceId: 'src-1' },
    })

    expect(res.statusCode).toBe(201)
    const stripped = factory.getQueue(QUEUES.SOURCE_SCRAPE)?.getEnqueued()[0]!.data as Record<string, unknown>
    expect(stripped['sourceId']).toBeUndefined()
    expect(typeof stripped['traceId']).toBe('string')

    await app.close()
  })
})

describe('POST /queues/:name/pause and /resume', () => {
  it('pauses and resumes a queue', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)

    const pauseRes = await app.inject({ method: 'POST', url: `/queues/${QUEUES.SOURCE_SCRAPE}/pause` })
    expect(pauseRes.statusCode).toBe(200)
    expect(pauseRes.json().data.paused).toBe(true)

    const q = factory.getQueue(QUEUES.SOURCE_SCRAPE) as MockQueueAdapter
    expect(await q.isPaused()).toBe(true)

    const resumeRes = await app.inject({ method: 'POST', url: `/queues/${QUEUES.SOURCE_SCRAPE}/resume` })
    expect(resumeRes.statusCode).toBe(200)
    expect(resumeRes.json().data.paused).toBe(false)

    expect(await q.isPaused()).toBe(false)

    await app.close()
  })
})

describe('GET /runs', () => {
  it('returns recent scraper runs from db', async () => {
    const run = { id: 'run-1', sourceId: 'src-1', startedAt: new Date(), finishedAt: null, success: null, listingsFound: null, listingsNew: null, listingsUpdated: null, errorMessage: null }
    const db = {
      scraperRun: { findMany: vi.fn(async () => [run]) },
      source: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    }
    const factory = new MockQueueFactory()
    const app = buildTestApp(db, factory)

    const res = await app.inject({ method: 'GET', url: '/runs' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(1)
    expect(res.json().data[0].id).toBe('run-1')
    expect(res.json().data[0].sourceName).toBeNull()

    expect(db.scraperRun.findMany).toHaveBeenCalledWith({ orderBy: { startedAt: 'desc' }, take: 100 })

    await app.close()
  })

  it('includes sourceName when a matching source exists', async () => {
    const run = { id: 'run-1', sourceId: 'src-1', startedAt: new Date(), finishedAt: null, success: null, listingsFound: null, listingsNew: null, listingsUpdated: null, errorMessage: null }
    const db = {
      scraperRun: { findMany: vi.fn(async () => [run]) },
      source: { findMany: vi.fn(async () => [{ id: 'src-1', name: 'BLVD.com' }]), findUnique: vi.fn(async () => null) },
    }
    const factory = new MockQueueFactory()
    const app = buildTestApp(db, factory)

    const res = await app.inject({ method: 'GET', url: '/runs' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data[0].sourceName).toBe('BLVD.com')

    await app.close()
  })
})

describe('POST /sources/:id/run', () => {
  it('enqueues a source-scrape job when source exists', async () => {
    const db = {
      scraperRun: { findMany: vi.fn(async () => []) },
      source: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => ({ id: 'src-1', name: 'Test Source' })) },
    }
    const factory = new MockQueueFactory()
    const app = buildTestApp(db, factory)

    const res = await app.inject({ method: 'POST', url: '/sources/src-1/run' })
    expect(res.statusCode).toBe(201)
    expect(typeof res.json().data.id).toBe('string')

    const q = factory.getQueue(QUEUES.SOURCE_SCRAPE) as MockQueueAdapter
    expect(q.getEnqueued()).toHaveLength(1)
    const jobData = q.getEnqueued()[0]!.data as Record<string, unknown>
    expect(jobData['sourceId']).toBe('src-1')
    expect(typeof jobData['traceId']).toBe('string')

    await app.close()
  })

  it('returns 404 when source does not exist', async () => {
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory)
    const res = await app.inject({ method: 'POST', url: '/sources/nonexistent/run' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})

describe('GET /sources', () => {
  it('returns source rows', async () => {
    const source = { id: 'src-1', name: 'test-source', baseUrl: 'https://example.com', status: 'active', cronExpression: '0 * * * *', lastScrapedAt: null, listingCount: 0, errorMessage: null }
    const db = {
      scraperRun: { findMany: vi.fn(async () => []) },
      source: { findMany: vi.fn(async () => [source]), findUnique: vi.fn(async () => null) },
    }
    const factory = new MockQueueFactory()
    const app = buildTestApp(db, factory)

    const res = await app.inject({ method: 'GET', url: '/sources' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(1)
    expect(res.json().data[0].name).toBe('test-source')

    await app.close()
  })
})

describe('POST /sync', () => {
  it('re-indexes all listings and returns the count', async () => {
    const search = { syncAll: vi.fn(async () => 7) }
    const factory = new MockQueueFactory()
    const app = buildTestApp(emptyDb, factory, search)

    const res = await app.inject({ method: 'POST', url: '/sync' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual({ synced: 7 })
    expect(search.syncAll).toHaveBeenCalledOnce()

    await app.close()
  })
})
