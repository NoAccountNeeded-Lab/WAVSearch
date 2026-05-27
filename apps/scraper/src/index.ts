import { getDb } from '@wav-search/db'
import { ScraperEngine } from './engine/scraper-engine.js'
import { BlvdAdapter } from './sources/blvd.js'
import { MobilityWorksAdapter } from './sources/mobilityworks.js'
import { OllamaProvider } from './ai/ollama-provider.js'
import { StructureDetector } from './ai/structure-detector.js'
import {
  PrismaScraperRunRepository,
  PrismaSourceRepository,
  PrismaListingRepository,
} from './infrastructure/prisma-repositories.js'
import { NodeCronScheduler } from './infrastructure/node-cron-scheduler.js'
import { runDetailCrawlJob } from './jobs/detail-crawl.js'
import { runDetailExtractJob } from './jobs/detail-extract.js'

const db = getDb()

const aiProvider = new OllamaProvider({
  baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
  model: process.env['OLLAMA_MODEL'] ?? 'llama3.2',
})

const engine = new ScraperEngine({
  runs: new PrismaScraperRunRepository(db),
  sources: new PrismaSourceRepository(db),
  listings: new PrismaListingRepository(db),
  structureDetector: new StructureDetector(aiProvider),
})

const blvdSource = await db.source.upsert({
  where: { name: 'BLVD.com' },
  update: {},
  create: {
    name: 'BLVD.com',
    baseUrl: 'https://www.blvd.com',
    cronExpression: '0 */6 * * *',
    timezone: 'America/New_York',
  },
})

engine.register(new BlvdAdapter(blvdSource.fingerprintHash), blvdSource.id)

const scheduler = new NodeCronScheduler()
scheduler.schedule(blvdSource.cronExpression, () => {
  void engine.runSource(blvdSource.id).catch(console.error)
}, { timezone: blvdSource.timezone })

// Crawl detail pages hourly — fetches raw HTML for any listing not yet detail-scraped
scheduler.schedule('0 * * * *', () => {
  void runDetailCrawlJob(blvdSource.id).catch(console.error)
}, { timezone: blvdSource.timezone })

// Extract every 5 min — processes stored raw HTML into listing fields, no network
scheduler.schedule('*/5 * * * *', () => {
  void runDetailExtractJob(blvdSource.id).catch(console.error)
}, { timezone: blvdSource.timezone })

const mwSource = await db.source.upsert({
  where: { name: 'MobilityWorks' },
  update: {},
  create: {
    name: 'MobilityWorks',
    baseUrl: 'https://www.mobilityworks.com',
    cronExpression: '0 */8 * * *',
    timezone: 'America/New_York',
  },
})

engine.register(new MobilityWorksAdapter(mwSource.fingerprintHash), mwSource.id)

scheduler.schedule(mwSource.cronExpression, () => {
  void engine.runSource(mwSource.id).catch(console.error)
}, { timezone: mwSource.timezone })

console.log('Scraper service started. Waiting for scheduled runs...')

process.on('SIGTERM', async () => {
  await db.$disconnect()
  process.exit(0)
})
