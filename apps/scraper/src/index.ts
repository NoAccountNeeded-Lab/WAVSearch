import 'dotenv/config'
import { getDb } from '@wav-search/db'
import { BullMQQueueFactory, QUEUES } from '@wav-search/queue'
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
import { runGeocodeJob } from './jobs/geocode.js'
import { runDeduplicateJob } from './jobs/deduplicate.js'

const db = getDb()

const ollamaProvider = new OllamaProvider({
  baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
  model: process.env['OLLAMA_MODEL'] ?? 'llama3.2',
})
const structureDetector = new StructureDetector(ollamaProvider)

const engine = new ScraperEngine({
  runs: new PrismaScraperRunRepository(db),
  sources: new PrismaSourceRepository(db),
  listings: new PrismaListingRepository(db),
  structureDetector: null,
})

async function runSourceWithAiCheck(sourceId: string): Promise<void> {
  const aiAvailable = await ollamaProvider.isAvailable()
  engine.setStructureDetector(aiAvailable ? structureDetector : null)
  if (!aiAvailable) {
    console.log('[ai] Ollama unavailable — running without AI-assisted remapping')
  }
  await engine.runSource(sourceId)
}

// --- Queue setup ---

const queueFactory = new BullMQQueueFactory()

// Workers — each processor calls the existing job function
queueFactory.createWorker<{ sourceId: string }>(
  QUEUES.SOURCE_SCRAPE,
  ({ sourceId }) => runSourceWithAiCheck(sourceId),
)
queueFactory.createWorker<{ sourceId: string }>(
  QUEUES.DETAIL_CRAWL,
  ({ sourceId }) => runDetailCrawlJob(sourceId),
)
queueFactory.createWorker<{ sourceId: string }>(
  QUEUES.DETAIL_EXTRACT,
  ({ sourceId }) => runDetailExtractJob(sourceId),
)
queueFactory.createWorker(QUEUES.GEOCODE, () => runGeocodeJob())
queueFactory.createWorker(QUEUES.DEDUPLICATE, () => runDeduplicateJob())

// Queue handles — used by the scheduler to enqueue
const scrapeQueue = queueFactory.createQueue(QUEUES.SOURCE_SCRAPE)
const crawlQueue = queueFactory.createQueue(QUEUES.DETAIL_CRAWL)
const extractQueue = queueFactory.createQueue(QUEUES.DETAIL_EXTRACT)
const geocodeQueue = queueFactory.createQueue(QUEUES.GEOCODE)
const deduplicateQueue = queueFactory.createQueue(QUEUES.DEDUPLICATE)

// --- Source registration ---

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

// --- Cron schedules — enqueue rather than call directly ---

const scheduler = new NodeCronScheduler()
const tz = blvdSource.timezone

scheduler.schedule(blvdSource.cronExpression, () => {
  void scrapeQueue.add({ sourceId: blvdSource.id }).catch(console.error)
}, { timezone: tz })

scheduler.schedule(mwSource.cronExpression, () => {
  void scrapeQueue.add({ sourceId: mwSource.id }).catch(console.error)
}, { timezone: mwSource.timezone })

// Crawl detail pages hourly
scheduler.schedule('0 * * * *', () => {
  void crawlQueue.add({ sourceId: blvdSource.id }).catch(console.error)
}, { timezone: tz })

// Extract every 5 min — no network, just processes stored HTML
scheduler.schedule('*/5 * * * *', () => {
  void extractQueue.add({ sourceId: blvdSource.id }).catch(console.error)
}, { timezone: tz })

// Geocode nightly
scheduler.schedule('0 2 * * *', () => {
  void geocodeQueue.add({}).catch(console.error)
}, { timezone: tz })

// Deduplicate nightly (after geocode)
scheduler.schedule('0 3 * * *', () => {
  void deduplicateQueue.add({}).catch(console.error)
}, { timezone: tz })

console.log('Scraper service started. Waiting for scheduled runs...')

process.on('SIGTERM', async () => {
  await queueFactory.close()
  await db.$disconnect()
  process.exit(0)
})
