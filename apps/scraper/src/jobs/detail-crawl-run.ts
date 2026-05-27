import 'dotenv/config'
import { getDb } from '@wav-search/db'
import { runDetailCrawlJob } from './detail-crawl.js'

const db = getDb()
const source = await db.source.findFirstOrThrow({ where: { name: 'BLVD.com' }, select: { id: true } })
await db.$disconnect()
await runDetailCrawlJob(source.id)
