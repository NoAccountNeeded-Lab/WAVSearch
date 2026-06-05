import 'dotenv/config'
import { getDb } from '@wav-search/db'
import { BullMQQueueFactory, QUEUES } from '@wav-search/queue'
import type { QueueAdapter } from '@wav-search/queue'
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
import { runDetailCrawlJob } from './jobs/detail-crawl.js'
import { runDetailExtractJob } from './jobs/detail-extract.js'
import { runGeocodeJob } from './jobs/geocode.js'
import { runDeduplicateJob } from './jobs/deduplicate.js'
import { runVinEnrichJob } from './jobs/vin-enrich.js'
import { runNhtsaRecallsJob } from './jobs/nhtsa-recalls.js'
import { runNhtsaComplaintsJob } from './jobs/nhtsa-complaints.js'
import { runNhtsaSafetyRatingsJob } from './jobs/nhtsa-safety-ratings.js'
import { runVehicleStatsRefreshJob } from './jobs/vehicle-stats-refresh.js'
import { runMeilisearchSyncJob } from './jobs/meilisearch-sync.js'
import { runRawPageCleanupJob } from './jobs/rawpage-cleanup.js'
import type { JobContext } from '@wav-search/queue'

const db = getDb()

const engine = new ScraperEngine({
  runs: new PrismaScraperRunRepository(db),
  sources: new PrismaSourceRepository(db),
  listings: new PrismaListingRepository(db),
  structureDetector: null,
})

/** Read a string config value from the DB. Falls back to null if unavailable. */
async function readConfigValue(key: string): Promise<string | null> {
  try {
    const row = await db.configEntry.findFirst({
      where: { key },
      orderBy: { createdAt: 'desc' },
    })
    if (!row || row.value === null) return null
    return typeof row.value === 'string' ? row.value : null
  } catch {
    return null
  }
}

async function runSourceWithAiCheck(sourceId: string, context?: JobContext): Promise<void> {
  const provider = await readConfigValue('ai.scraper.structure.provider') ?? 'ollama'
  const model = await readConfigValue('ai.scraper.structure.model')

  const ollamaProvider = new OllamaProvider({
    baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    model: model ?? process.env['OLLAMA_MODEL'] ?? 'llama3.2',
  })

  if (provider !== 'ollama') {
    console.log(`[ai] Provider "${provider}" not yet supported for scraper — falling back to ollama`)
    await context?.log(`[ai] Provider "${provider}" not yet supported for scraper — falling back to ollama`)
  }

  const structureDetector = new StructureDetector(ollamaProvider)
  const aiAvailable = await ollamaProvider.isAvailable()
  engine.setStructureDetector(aiAvailable ? structureDetector : null)
  if (!aiAvailable) {
    console.log('[ai] Ollama unavailable — running without AI-assisted remapping')
    await context?.log('[ai] Ollama unavailable — running without AI-assisted remapping')
  }
  await engine.runSource(sourceId, context)
}

// --- Queue setup ---

const queueFactory = new BullMQQueueFactory()
let shutdownPromise: Promise<void> | undefined

function shutdown(signal: NodeJS.Signals): Promise<void> {
  shutdownPromise ??= (async () => {
    console.log(`[shutdown] ${signal} received, closing scraper`)

    try {
      await queueFactory.close()
      await db.$disconnect()
      console.log('[shutdown] Scraper shutdown complete')
      process.exit(0)
    } catch (err) {
      console.error('[shutdown] Scraper shutdown failed', err)
      process.exit(1)
    }
  })()

  return shutdownPromise
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

// Workers — each processor calls the existing job function
queueFactory.createWorker<{ sourceId: string }>(
  QUEUES.SOURCE_SCRAPE,
  ({ sourceId }, context) => runSourceWithAiCheck(sourceId, context),
  { lockDuration: 300_000 },
)
queueFactory.createWorker<{ sourceId: string }>(
  QUEUES.DETAIL_CRAWL,
  ({ sourceId }, context) => runDetailCrawlJob(sourceId, context, listingSyncQueue),
  { lockDuration: 120_000 },
)
queueFactory.createWorker<{ sourceId: string }>(
  QUEUES.DETAIL_EXTRACT,
  ({ sourceId }, context) => runDetailExtractJob(sourceId, context),
  { lockDuration: 60_000 },
)
queueFactory.createWorker(QUEUES.GEOCODE, (_data, context) => runGeocodeJob(context), { lockDuration: 120_000 })
queueFactory.createWorker(QUEUES.DEDUPLICATE, (_data, context) => runDeduplicateJob(context), { lockDuration: 120_000 })
queueFactory.createWorker(QUEUES.VIN_ENRICH, (_data, context) => runVinEnrichJob(context), { lockDuration: 300_000 })
queueFactory.createWorker(QUEUES.NHTSA_RECALLS, (_data, context) => runNhtsaRecallsJob(context), { lockDuration: 300_000 })
queueFactory.createWorker(QUEUES.NHTSA_COMPLAINTS, (_data, context) => runNhtsaComplaintsJob(context), { lockDuration: 600_000 })
queueFactory.createWorker(QUEUES.NHTSA_SAFETY_RATINGS, (_data, context) => runNhtsaSafetyRatingsJob(context), { lockDuration: 600_000 })
queueFactory.createWorker(QUEUES.VEHICLE_STATS_REFRESH, (_data, context) => runVehicleStatsRefreshJob(context), { lockDuration: 60_000 })
queueFactory.createWorker(QUEUES.LISTING_SYNC, (_data, context) => runMeilisearchSyncJob(context), { lockDuration: 300_000 })
queueFactory.createWorker(QUEUES.RAWPAGE_CLEANUP, (_data, context) => runRawPageCleanupJob(context), { lockDuration: 120_000 })

const scrapeQueue = queueFactory.createQueue(QUEUES.SOURCE_SCRAPE)
const crawlQueue = queueFactory.createQueue(QUEUES.DETAIL_CRAWL)
const extractQueue = queueFactory.createQueue(QUEUES.DETAIL_EXTRACT)
const geocodeQueue = queueFactory.createQueue(QUEUES.GEOCODE)
const deduplicateQueue = queueFactory.createQueue(QUEUES.DEDUPLICATE)
const vinEnrichQueue = queueFactory.createQueue(QUEUES.VIN_ENRICH)
const nhtsaRecallsQueue = queueFactory.createQueue(QUEUES.NHTSA_RECALLS)
const nhtsaComplaintsQueue = queueFactory.createQueue(QUEUES.NHTSA_COMPLAINTS)
const nhtsaSafetyRatingsQueue = queueFactory.createQueue(QUEUES.NHTSA_SAFETY_RATINGS)
const vehicleStatsRefreshQueue = queueFactory.createQueue(QUEUES.VEHICLE_STATS_REFRESH)
const listingSyncQueue = queueFactory.createQueue(QUEUES.LISTING_SYNC)
const rawPageCleanupQueue = queueFactory.createQueue(QUEUES.RAWPAGE_CLEANUP)

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

engine.register(new BlvdAdapter(blvdSource.fingerprintHash, { previousPage1Hash: blvdSource.page1Hash }), blvdSource.id)

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

engine.register(new MobilityWorksAdapter(mwSource.fingerprintHash, { previousPage1Hash: mwSource.page1Hash }), mwSource.id)

// --- Repeatable schedules ---
// BullMQ/Valkey owns the schedule; no node-cron process needed.
// On startup we only add a schedule if it isn't already in BullMQ, so that
// changes made via the ops UI (/ops/schedules) survive scraper restarts.

interface ScheduleDef {
  queue: QueueAdapter
  name: string
  data: Record<string, unknown>
  pattern: string
  tz: string
  jobId?: string  // stable ID used to identify per-source repeatable jobs
}

const tz = blvdSource.timezone

const SCHEDULE_DEFS: ScheduleDef[] = [
  { queue: scrapeQueue, name: QUEUES.SOURCE_SCRAPE, data: { sourceId: blvdSource.id }, pattern: blvdSource.cronExpression, tz: blvdSource.timezone, jobId: 'blvd' },
  { queue: scrapeQueue, name: QUEUES.SOURCE_SCRAPE, data: { sourceId: mwSource.id },   pattern: mwSource.cronExpression,   tz: mwSource.timezone,   jobId: 'mw'   },
  { queue: crawlQueue,   name: QUEUES.DETAIL_CRAWL,   data: { sourceId: blvdSource.id }, pattern: '0 * * * *',   tz,                  jobId: 'blvd-crawl'   },
  { queue: crawlQueue,   name: QUEUES.DETAIL_CRAWL,   data: { sourceId: mwSource.id },   pattern: '0 * * * *',   tz: mwSource.timezone, jobId: 'mw-crawl'     },
  { queue: extractQueue, name: QUEUES.DETAIL_EXTRACT, data: { sourceId: blvdSource.id }, pattern: '*/5 * * * *', tz,                  jobId: 'blvd-extract' },
  { queue: extractQueue, name: QUEUES.DETAIL_EXTRACT, data: { sourceId: mwSource.id },   pattern: '*/5 * * * *', tz: mwSource.timezone, jobId: 'mw-extract'   },
  { queue: geocodeQueue,           name: QUEUES.GEOCODE,             data: {},                          pattern: '0 2 * * *',      tz },
  { queue: deduplicateQueue,       name: QUEUES.DEDUPLICATE,         data: {},                          pattern: '0 3 * * *',      tz },
  { queue: vinEnrichQueue,         name: QUEUES.VIN_ENRICH,          data: {},                          pattern: '30 * * * *',     tz },
  { queue: nhtsaRecallsQueue,      name: QUEUES.NHTSA_RECALLS,       data: {},                          pattern: '0 4 * * *',      tz },
  { queue: nhtsaComplaintsQueue,   name: QUEUES.NHTSA_COMPLAINTS,    data: {},                          pattern: '0 5 * * 0',      tz },
  { queue: nhtsaSafetyRatingsQueue,  name: QUEUES.NHTSA_SAFETY_RATINGS,   data: {}, pattern: '0 6 * * 0',  tz },
  { queue: vehicleStatsRefreshQueue, name: QUEUES.VEHICLE_STATS_REFRESH,   data: {}, pattern: '0 1 * * 0',  tz },
  { queue: listingSyncQueue,         name: QUEUES.LISTING_SYNC,            data: {}, pattern: '0 5 * * *',  tz },
  { queue: rawPageCleanupQueue,      name: QUEUES.RAWPAGE_CLEANUP,         data: {}, pattern: '0 1 * * *',  tz },
]

for (const def of SCHEDULE_DEFS) {
  const existing = await def.queue.getRepeatableJobs()
  const alreadyScheduled = def.jobId
    ? existing.some((r) => r.id === def.jobId)
    : existing.some((r) => r.name === def.name)

  if (!alreadyScheduled) {
    await def.queue.addRepeatable(def.name, def.data, def.pattern, def.tz, def.jobId)
    console.log(`[schedule] Registered: ${def.name}${def.jobId ? ` (${def.jobId})` : ''} @ ${def.pattern} ${def.tz}`)
  } else {
    console.log(`[schedule] Already registered: ${def.name}${def.jobId ? ` (${def.jobId})` : ''}`)
  }
}

console.log('Scraper service started.')
