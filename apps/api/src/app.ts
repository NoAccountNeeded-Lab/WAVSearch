import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import { createBullBoard } from '@bull-board/api'
import { FastifyAdapter } from '@bull-board/fastify'
import type { Redis } from 'ioredis'
import type { MeiliSearch } from 'meilisearch'
import type { PrismaClient } from '@wav-search/db'
import type { BullMQQueueFactory } from '@wav-search/queue'
import { createBullBoardQueues } from '@wav-search/queue/bullmq/board'
import type { Config } from './config.js'
import type { ListingSearchService } from './services/listing-search.js'
import type { ListingFacetsService } from './services/listing-facets.js'
import { healthRoutes } from './routes/health.js'
import { listingRoutes } from './routes/listings.js'
import { sourceRoutes } from './routes/sources.js'
import { adminRoutes } from './routes/admin.js'

export async function buildApp(
  config: Config,
  db: PrismaClient,
  meili: MeiliSearch,
  cache: Redis,
  search: ListingSearchService,
  facets: ListingFacetsService,
  queueFactory: BullMQQueueFactory,
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'production'
        ? true
        : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  })

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(cors, { origin: config.CORS_ORIGIN })
  await app.register(sensible)

  await app.register(healthRoutes, { prefix: '/health', db, meili, cache, config })
  await app.register(listingRoutes, { prefix: '/v1/listings', db, search, facets })
  await app.register(sourceRoutes, { prefix: '/v1/sources' })
  await app.register(adminRoutes, { prefix: '/admin', db, queueFactory })

  const boardAdapter = new FastifyAdapter()
  boardAdapter.setBasePath('/admin/board')
  createBullBoard({ queues: createBullBoardQueues(queueFactory), serverAdapter: boardAdapter })
  await app.register(boardAdapter.registerPlugin(), { prefix: '/admin/board' })

  return app
}
