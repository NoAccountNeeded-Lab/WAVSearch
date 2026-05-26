import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import type { PrismaClient } from '@wav-search/db'
import type { Config } from './config.js'
import type { ListingSearchService } from './services/listing-search.js'
import { healthRoutes } from './routes/health.js'
import { listingRoutes } from './routes/listings.js'
import { sourceRoutes } from './routes/sources.js'

export function buildApp(config: Config, db: PrismaClient, search: ListingSearchService) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'production'
        ? true
        : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  })

  void app.register(cors, { origin: config.CORS_ORIGIN })
  void app.register(sensible)

  void app.register(healthRoutes, { prefix: '/health' })
  void app.register(listingRoutes, { prefix: '/v1/listings', db, search })
  void app.register(sourceRoutes, { prefix: '/v1/sources' })

  return app
}
