import 'dotenv/config'
import { getDb } from '@wav-search/db'
import { loadConfig } from './config.js'
import { buildApp } from './app.js'

const config = loadConfig()
const db = getDb()
const app = buildApp(config, db)

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
