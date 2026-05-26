import 'dotenv/config'
import { MeiliSearch } from 'meilisearch'
import { getDb } from '@wav-search/db'
import { loadConfig } from './config.js'
import { buildApp } from './app.js'
import { configureListingsIndex, ListingSearchService } from './services/listing-search.js'

const config = loadConfig()
const db = getDb()
const meili = new MeiliSearch({ host: config.MEILISEARCH_HOST, apiKey: config.MEILISEARCH_API_KEY })
const search = new ListingSearchService(meili)
const app = buildApp(config, db, search)

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
  .catch(err => app.log.warn(err, '[search] Initial sync failed — Meilisearch may not be available'))
