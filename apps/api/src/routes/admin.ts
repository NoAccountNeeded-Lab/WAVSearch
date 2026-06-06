import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wivwav/db'
import type { QueueAdapter, QueueFactory } from '@wivwav/queue'
import { QUEUES } from '@wivwav/queue'
import type { ListingSearchService } from '../services/listing-search.js'

interface AdminPluginOptions {
  db: PrismaClient
  queueFactory: QueueFactory
  search: ListingSearchService
}

interface QueueJobBody {
  data?: Record<string, unknown>
}

const queueJobBodySchema = {
  anyOf: [
    {
      type: 'object',
      properties: {
        data: { type: 'object', additionalProperties: true },
      },
      additionalProperties: false,
    },
    { type: 'null' },
  ],
} as const

export const adminRoutes: FastifyPluginAsync<AdminPluginOptions> = async (
  app,
  { db, queueFactory, search },
) => {
  const queues = new Map<string, QueueAdapter>()
  for (const name of Object.values(QUEUES)) {
    queues.set(name, queueFactory.createQueue(name))
  }

  // GET /admin/queues — all queues with stats
  app.get('/queues', async (_req, reply) => {
    const data = await Promise.all(
      [...queues.entries()].map(async ([name, q]) => ({
        name,
        paused: await q.isPaused(),
        stats: await q.getStats(),
      })),
    )
    return reply.send({ data })
  })

  // GET /admin/queues/:name — single queue stats + recent jobs
  app.get<{ Params: { name: string } }>('/queues/:name', async (req, reply) => {
    const q = queues.get(req.params.name)
    if (!q) return reply.notFound(`Queue "${req.params.name}" not found`)
    const [stats, paused, jobs] = await Promise.all([
      q.getStats(),
      q.isPaused(),
      q.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']),
    ])
    return reply.send({ data: { name: req.params.name, paused, stats, jobs } })
  })

  // POST /admin/queues/:name/jobs — enqueue a job
  app.post<{ Params: { name: string }; Body: QueueJobBody | null }>(
    '/queues/:name/jobs',
    { schema: { body: queueJobBodySchema } },
    async (req, reply) => {
      const q = queues.get(req.params.name)
      if (!q) return reply.notFound(`Queue "${req.params.name}" not found`)
      const id = await q.add(req.body?.data ?? {})
      return reply.code(201).send({ data: { id } })
    },
  )

  // POST /admin/queues/:name/pause
  app.post<{ Params: { name: string } }>('/queues/:name/pause', async (req, reply) => {
    const q = queues.get(req.params.name)
    if (!q) return reply.notFound(`Queue "${req.params.name}" not found`)
    await q.pause()
    return reply.send({ data: { paused: true } })
  })

  // POST /admin/queues/:name/resume
  app.post<{ Params: { name: string } }>('/queues/:name/resume', async (req, reply) => {
    const q = queues.get(req.params.name)
    if (!q) return reply.notFound(`Queue "${req.params.name}" not found`)
    await q.resume()
    return reply.send({ data: { paused: false } })
  })

  // GET /admin/runs — last 100 scraper runs ordered by startedAt desc, with source name
  app.get('/runs', async (_req, reply) => {
    const runs = await db.scraperRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
    })
    const sourceIds = [...new Set(runs.map(r => r.sourceId))]
    const sources = sourceIds.length
      ? await db.source.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } })
      : []
    const nameById = new Map(sources.map(s => [s.id, s.name]))
    return reply.send({ data: runs.map(r => ({ ...r, sourceName: nameById.get(r.sourceId) ?? null })) })
  })

  // GET /admin/sources — sources with status, lastScrapedAt, listingCount
  app.get('/sources', async (_req, reply) => {
    const sources = await db.source.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        baseUrl: true,
        status: true,
        cronExpression: true,
        lastScrapedAt: true,
        listingCount: true,
        errorMessage: true,
      },
    })
    return reply.send({ data: sources })
  })

  // POST /admin/sources/:id/run — immediately enqueue a source-scrape job
  app.post<{ Params: { id: string } }>('/sources/:id/run', async (req, reply) => {
    const source = await db.source.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } })
    if (!source) return reply.notFound(`Source "${req.params.id}" not found`)
    const q = queues.get(QUEUES.SOURCE_SCRAPE)!
    const id = await q.add({ sourceId: source.id })
    return reply.code(201).send({ data: { id } })
  })

  // POST /admin/sync — re-index all listings into Meilisearch
  app.post('/sync', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (_req, reply) => {
    const count = await search.syncAll(db)
    return reply.send({ data: { synced: count } })
  })

  // ── Repeatables ────────────────────────────────────────────────────────────
  // Canonical schedule definitions, merged with live BullMQ state.
  // "Canonical" = what the scraper sets up on first boot. Stored here so the
  // UI can re-enable a schedule even after it's been removed from BullMQ.

  type CanonicalDef = {
    id: string
    queue: string
    jobId?: string
    label: string
    name: string
    data: Record<string, unknown>
    defaultPattern: string
    tz: string
  }

  async function getCanonicalDefs(): Promise<CanonicalDef[]> {
    const sources = await db.source.findMany({
      where: { name: { in: ['BLVD.com', 'MobilityWorks'] } },
      select: { id: true, name: true, cronExpression: true, timezone: true },
    })
    const blvd = sources.find((s) => s.name === 'BLVD.com')
    const mw = sources.find((s) => s.name === 'MobilityWorks')
    const tz = blvd?.timezone ?? 'America/New_York'
    return [
      ...(blvd ? [{ id: 'blvd', queue: 'source-scrape', jobId: 'blvd', label: 'BLVD.com scrape', name: 'source-scrape', data: { sourceId: blvd.id }, defaultPattern: blvd.cronExpression, tz: blvd.timezone }] : []),
      ...(mw   ? [{ id: 'mw',   queue: 'source-scrape', jobId: 'mw',   label: 'MobilityWorks scrape', name: 'source-scrape', data: { sourceId: mw.id }, defaultPattern: mw.cronExpression, tz: mw.timezone }] : []),
      { id: 'detail-crawl',    queue: 'detail-crawl',    label: 'Detail crawl (Playwright)', name: 'detail-crawl',    data: { sourceId: blvd?.id ?? '' }, defaultPattern: '0 * * * *',   tz },
      { id: 'detail-extract',  queue: 'detail-extract',  label: 'Detail extract (HTML)',     name: 'detail-extract',  data: { sourceId: blvd?.id ?? '' }, defaultPattern: '*/5 * * * *', tz },
      { id: 'geocode',         queue: 'geocode',         label: 'Geocode (city → GPS)',      name: 'geocode',         data: {},                          defaultPattern: '0 2 * * *',   tz },
      { id: 'deduplicate',     queue: 'deduplicate',     label: 'Deduplicate (VIN)',         name: 'deduplicate',     data: {},                          defaultPattern: '0 3 * * *',   tz },
      { id: 'rawpage-cleanup', queue: 'rawpage-cleanup', label: 'RawPage cleanup (TTL)',      name: 'rawpage-cleanup', data: {},                          defaultPattern: '0 1 * * *',   tz },
    ]
  }

  // GET /admin/repeatables — merged canonical + live BullMQ state
  app.get('/repeatables', async (_req, reply) => {
    const defs = await getCanonicalDefs()

    // Collect current repeatables from all relevant queues
    const liveByQueue = new Map<string, Awaited<ReturnType<QueueAdapter['getRepeatableJobs']>>>()
    for (const q of queues.values()) {
      liveByQueue.set(q.name, await q.getRepeatableJobs())
    }

    const data = defs.map((def) => {
      const live = liveByQueue.get(def.queue) ?? []
      const match = def.jobId
        ? live.find((r) => r.id === def.jobId)
        : live.find((r) => r.name === def.name)

      return {
        id: def.id,
        queue: def.queue,
        jobId: def.jobId ?? null,
        label: def.label,
        name: def.name,
        data: def.data,
        defaultPattern: def.defaultPattern,
        tz: def.tz,
        enabled: !!match,
        key: match?.key ?? null,
        pattern: match?.pattern ?? def.defaultPattern,
        next: match?.next ?? null,
      }
    })

    return reply.send({ data })
  })

  // DELETE /admin/repeatables/:queue — disable (remove from BullMQ) by key
  app.delete<{ Params: { queue: string }; Body: { key: string } }>(
    '/repeatables/:queue',
    async (req, reply) => {
      const q = queues.get(req.params.queue)
      if (!q) return reply.notFound(`Queue "${req.params.queue}" not found`)
      await q.removeRepeatableByKey(req.body.key)
      return reply.send({ data: { removed: true } })
    },
  )

  // POST /admin/repeatables/:queue — enable (add) a repeatable
  app.post<{
    Params: { queue: string }
    Body: { name: string; data: Record<string, unknown>; pattern: string; tz?: string; jobId?: string }
  }>('/repeatables/:queue', async (req, reply) => {
    const q = queues.get(req.params.queue)
    if (!q) return reply.notFound(`Queue "${req.params.queue}" not found`)
    const { name, data, pattern, tz, jobId } = req.body
    await q.addRepeatable(name, data, pattern, tz, jobId)
    return reply.code(201).send({ data: { added: true } })
  })

  // PUT /admin/repeatables/:queue — update pattern (remove old key, add with new pattern)
  app.put<{
    Params: { queue: string }
    Body: { key: string; name: string; data: Record<string, unknown>; pattern: string; tz?: string; jobId?: string }
  }>('/repeatables/:queue', async (req, reply) => {
    const q = queues.get(req.params.queue)
    if (!q) return reply.notFound(`Queue "${req.params.queue}" not found`)
    const { key, name, data, pattern, tz, jobId } = req.body
    await q.removeRepeatableByKey(key)
    await q.addRepeatable(name, data, pattern, tz, jobId)
    return reply.send({ data: { updated: true } })
  })
}
