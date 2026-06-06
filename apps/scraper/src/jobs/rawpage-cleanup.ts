import { getDb } from '@wivwav/db'
import type { JobContext } from '@wivwav/queue'
import { report } from './job-progress.js'

const PROCESSED_RETENTION_DAYS = 7
const UNPROCESSED_RETENTION_DAYS = 30

export async function runRawPageCleanupJob(context?: JobContext): Promise<void> {
  const db = getDb()

  const now = new Date()
  const processedCutoff = new Date(now.getTime() - PROCESSED_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const unprocessedCutoff = new Date(now.getTime() - UNPROCESSED_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  try {
    const { count: processedDeleted } = await db.rawPage.deleteMany({
      where: {
        processedAt: { not: null },
        scrapedAt: { lt: processedCutoff },
      },
    })

    const { count: staleDeleted } = await db.rawPage.deleteMany({
      where: {
        processedAt: null,
        scrapedAt: { lt: unprocessedCutoff },
      },
    })

    const total = processedDeleted + staleDeleted
    await report(
      context,
      `[rawpage-cleanup] Deleted ${processedDeleted} processed (>${PROCESSED_RETENTION_DAYS}d) + ${staleDeleted} stale unprocessed (>${UNPROCESSED_RETENTION_DAYS}d) = ${total} rows`,
      { stage: 'complete', current: total, total },
    )
  } finally {
    await db.$disconnect()
  }
}
