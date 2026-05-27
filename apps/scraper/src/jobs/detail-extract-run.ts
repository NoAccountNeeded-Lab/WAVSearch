import 'dotenv/config'
import { getDb } from '@wav-search/db'
import { runDetailExtractJob } from './detail-extract.js'

const db = getDb()
const source = await db.source.findFirstOrThrow({ where: { name: 'BLVD.com' }, select: { id: true } })
await db.$disconnect()
await runDetailExtractJob(source.id)
