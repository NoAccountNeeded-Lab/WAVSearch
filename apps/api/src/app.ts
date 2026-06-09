import Fastify, { type FastifyError } from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import rateLimit from '@fastify/rate-limit'
import { createBullBoard } from '@bull-board/api'
import { FastifyAdapter } from '@bull-board/fastify'
import type { Redis } from 'ioredis'
import type { Meilisearch } from 'meilisearch'
import type { PrismaClient } from '@wivwav/db'
import { createPinoLoggerOptions } from '@wivwav/logger'
import type { BullMQQueueFactory } from '@wivwav/queue'
import { createBullBoardQueues } from '@wivwav/queue/bullmq/board'
import type { Config } from './config.js'
import type { ListingSearchService } from './services/listing-search.js'
import type { ListingFacetsService } from './services/listing-facets.js'
import { healthRoutes } from './routes/health.js'
import { listingRoutes } from './routes/listings.js'
import { vehicleRoutes } from './routes/vehicles.js'
import { vinRoutes } from './routes/vin.js'
import { marketRoutes } from './routes/market.js'
import { sourceRoutes } from './routes/sources.js'
import { adminRoutes } from './routes/admin.js'
import { adminAiRoutes } from './routes/admin-ai.js'
import { adminConfigRoutes } from './routes/admin-config.js'

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
  meili: Meilisearch,
  cache: Redis,
  search: ListingSearchService,
  facets: ListingFacetsService,
  queueFactory: BullMQQueueFactory,
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : createPinoLoggerOptions({ service: 'api', env: config.NODE_ENV }),
    // Custom hooks below handle request/response logging with structured fields.
    disableRequestLogging: true,
  })

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(cors, {
    origin: (origin, cb) => {
      cb(null, isAllowedCorsOrigin(origin, config))
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  })
  await app.register(sensible)

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info({
      method: request.method,
      url: request.routeOptions.url ?? request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    }, 'request completed')
    done()
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error')
    }
    void reply.code(statusCode).send(error)
  })

  await app.register(healthRoutes, { prefix: '/health', db, meili, cache, config })
  await app.register(listingRoutes, { prefix: '/v1/listings', db, search, facets })
  await app.register(vehicleRoutes, { prefix: '/v1/vehicles', db })
  await app.register(vinRoutes, { prefix: '/v1/vin', db })
  await app.register(marketRoutes, { prefix: '/v1/market', db })
  await app.register(sourceRoutes, { prefix: '/v1/sources' })
  await app.register(adminRoutes, { prefix: '/admin', db, queueFactory, search })
  await app.register(adminAiRoutes, {
    prefix: '/admin/ai',
    db,
    ollamaBaseUrl: config.OLLAMA_BASE_URL,
  })
  await app.register(adminConfigRoutes, {
    prefix: '/admin/config',
    db,
    cache,
    encryptionSecret: config.CONFIG_ENCRYPTION_SECRET,
    internalApiSecret: config.INTERNAL_API_SECRET,
  })

  const boardAdapter = new FastifyAdapter()
  boardAdapter.setBasePath('/admin/board')
  createBullBoard({ queues: createBullBoardQueues(queueFactory), serverAdapter: boardAdapter })
  await app.register(boardAdapter.registerPlugin(), { prefix: '/admin/board' })

  return app
}
