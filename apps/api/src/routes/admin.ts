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

  // GET /admin/runs — last 100 scraper runs ordered by startedAt desc
  app.get('/runs', async (_req, reply) => {
    const runs = await db.scraperRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
    })
    return reply.send({ data: runs })
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
}
