import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'
import type { QueueAdapter, QueueFactory } from '@wav-search/queue'
import { QUEUES } from '@wav-search/queue'

interface AdminPluginOptions {
  db: PrismaClient
  queueFactory: QueueFactory
}

export const adminRoutes: FastifyPluginAsync<AdminPluginOptions> = async (
  app,
  { db, queueFactory },
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
  app.post<{ Params: { name: string }; Body: { data?: unknown } }>(
    '/queues/:name/jobs',
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
}
