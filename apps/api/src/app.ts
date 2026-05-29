import Fastify from 'fastify'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import type { Redis } from 'ioredis'
import type { MeiliSearch } from 'meilisearch'
import type { PrismaClient } from '@wav-search/db'
import type { Config } from './config.js'
import type { ListingSearchService } from './services/listing-search.js'
import type { ListingFacetsService } from './services/listing-facets.js'
import { healthRoutes } from './routes/health.js'
import { listingRoutes } from './routes/listings.js'
import { sourceRoutes } from './routes/sources.js'

export function buildApp(
  config: Config,
  db: PrismaClient,
  meili: MeiliSearch,
  cache: Redis,
  search: ListingSearchService,
  facets: ListingFacetsService
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'production'
        ? true
        : { transport: { target: 'pino-pretty', options: { colorize: true } } },
  })

  void app.register(cors, { origin: config.CORS_ORIGIN })
  void app.register(sensible)

  void app.register(healthRoutes, { prefix: '/health', db, meili, cache, config })
  void app.register(listingRoutes, { prefix: '/v1/listings', db, search, facets })
  void app.register(sourceRoutes, { prefix: '/v1/sources' })

  return app
}
