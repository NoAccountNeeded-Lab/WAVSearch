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

let shutdownPromise: Promise<void> | undefined

async function closeCache(): Promise<void> {
  if (cache.status === 'ready') {
    await cache.quit()
    return
  }

  cache.disconnect()
}

function shutdown(signal: NodeJS.Signals): Promise<void> {
  shutdownPromise ??= (async () => {
    app.log.info(`[shutdown] ${signal} received, closing`)

    try {
      await app.close()
      await queueFactory.close()
      await closeCache()
      await db.$disconnect()
      app.log.info('[shutdown] complete')
      process.exit(0)
    } catch (err) {
      app.log.error(err, '[shutdown] failed')
      process.exit(1)
    }
  })()

  return shutdownPromise
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

// Apply index settings before accepting traffic so filters/facets work on the
// first request. Idempotent — safe on every restart, including a fresh container.
try {
  await configureListingsIndex(meili)
  app.log.info('[search] Index settings applied')
} catch (err) {
  const reason = err instanceof Error ? `: ${err.message}` : ''
  app.log.warn(`[search] Index config skipped; Meilisearch may not be available${reason}`)
}

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Initial sync runs in the background — can take minutes with many listings.
// Idempotent; safe to run on every restart.
void search.syncAll(db)
  .then(n => app.log.info(`[search] Initial sync complete — ${n} listings indexed`))
  .catch(err => {
    const reason = err instanceof Error ? `: ${err.message}` : ''
    app.log.warn(`[search] Initial sync skipped; Meilisearch may not be available${reason}`)
  })
