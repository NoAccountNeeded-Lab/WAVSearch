import 'dotenv/config'
import { MeiliSearch } from 'meilisearch'
import { Redis } from 'ioredis'
import { getDb } from '@wav-search/db'
import { BullMQQueueFactory } from '@wav-search/queue'
import { loadConfig } from './config.js'
import { buildApp } from './app.js'
import { configureListingsIndex, ListingSearchService } from './services/listing-search.js'
import { ListingFacetsService } from './services/listing-facets.js'

const config = loadConfig()
const db = getDb()
const meili = new MeiliSearch({ host: config.MEILISEARCH_HOST, apiKey: config.MEILISEARCH_API_KEY })
const cache = new Redis(config.VALKEY_URL, { lazyConnect: true, enableOfflineQueue: false })
const search = new ListingSearchService(meili)
const facets = new ListingFacetsService(meili, cache)
const queueFactory = new BullMQQueueFactory()
const app = await buildApp(config, db, meili, cache, search, facets, queueFactory)

let shuttingDown = false

async function closeCache(): Promise<void> {
  if (cache.status === 'ready') {
    await cache.quit()
    return
  }

  cache.disconnect()
}

const shutdown = async (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true

  app.log.info(`[shutdown] ${signal} received, closing`)
  try {
    await app.close()
    await queueFactory.close()
    await closeCache()
    await db.$disconnect()
    process.exit(0)
  } catch (err) {
    app.log.error(err, '[shutdown] failed')
    process.exit(1)
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Configure index settings and run initial sync in the background after startup.
// Both are idempotent — safe to run on every restart.
void configureListingsIndex(meili)
  .then(() => search.syncAll(db))
  .then(n => app.log.info(`[search] Initial sync complete — ${n} listings indexed`))
  .catch(err => {
    const reason = err instanceof Error ? `: ${err.message}` : ''
    app.log.warn(`[search] Initial sync skipped; Meilisearch may not be available${reason}`)
  })
