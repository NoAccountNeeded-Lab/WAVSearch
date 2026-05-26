import cron from 'node-cron'
import { getDb } from '@wav-search/db'
import { ScraperEngine } from './engine/scraper-engine.js'
import { BlvdAdapter } from './sources/blvd.js'
import { OllamaProvider } from './ai/ollama-provider.js'
import { StructureDetector } from './ai/structure-detector.js'
import {
  PrismaScraperRunRepository,
  PrismaSourceRepository,
  PrismaListingRepository,
} from './infrastructure/prisma-repositories.js'

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

engine.register(new BlvdAdapter(blvdSource.fingerprintHash))

cron.schedule(blvdSource.cronExpression, () => {
  void engine.runSource(blvdSource.id).catch(console.error)
}, { timezone: blvdSource.timezone })

console.log('Scraper service started. Waiting for scheduled runs...')

process.on('SIGTERM', async () => {
  await db.$disconnect()
  process.exit(0)
})
