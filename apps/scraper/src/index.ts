import cron from 'node-cron'
import { getDb } from '@wav-search/db'
import { ScraperEngine } from './engine/scraper-engine.js'
import { BlvdAdapter } from './sources/blvd.js'

const db = getDb()
const engine = new ScraperEngine({ db, concurrency: Number(process.env['SCRAPER_CONCURRENCY'] ?? 2) })

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
