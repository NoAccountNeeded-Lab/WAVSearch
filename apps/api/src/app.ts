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
import { vehicleRoutes } from './routes/vehicles.js'
import { vinRoutes } from './routes/vin.js'
import { sourceRoutes } from './routes/sources.js'
import { adminRoutes } from './routes/admin.js'
import { adminAiRoutes } from './routes/admin-ai.js'

export function isAllowedCorsOrigin(origin: string | undefined, config: Config): boolean {
  if (!origin) return true

  const configuredOrigins = Array.isArray(config.CORS_ORIGIN)
    ? config.CORS_ORIGIN
    : [config.CORS_ORIGIN]
  if (configuredOrigins.includes('*') || configuredOrigins.includes(origin)) return true

  if (config.NODE_ENV !== 'development') return false

  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

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
      config.NODE_ENV === 'test'
        ? false
        : config.NODE_ENV === 'production'
        ? true
        : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  })

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, isAllowedCorsOrigin(origin, config))
    },
  })
  await app.register(sensible)

  await app.register(healthRoutes, { prefix: '/health', db, meili, cache, config })
  await app.register(listingRoutes, { prefix: '/v1/listings', db, search, facets })
  await app.register(vehicleRoutes, { prefix: '/v1/vehicles', db })
  await app.register(vinRoutes, { prefix: '/v1/vin', db })
  await app.register(sourceRoutes, { prefix: '/v1/sources' })
  await app.register(adminRoutes, { prefix: '/admin', db, queueFactory, search })
  await app.register(adminAiRoutes, { prefix: '/admin/ai', db, ollamaBaseUrl: config.OLLAMA_BASE_URL })

  const boardAdapter = new FastifyAdapter()
  boardAdapter.setBasePath('/admin/board')
  createBullBoard({ queues: createBullBoardQueues(queueFactory), serverAdapter: boardAdapter })
  await app.register(boardAdapter.registerPlugin(), { prefix: '/admin/board' })

  return app
}
