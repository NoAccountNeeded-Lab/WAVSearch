import 'dotenv/config'
import { MeiliSearch } from 'meilisearch'
import { Redis } from 'ioredis'
import { getDb } from '@wav-search/db'
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
const app = buildApp(config, db, search, facets)

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
