import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import { INDEX_NAME, toDocument } from '@wav-search/search'
import { getMeiliClient } from '../lib/meili.js'
import { report } from './job-progress.js'

const BATCH_SIZE = 1000
const DRIFT_ALERT_THRESHOLD = 0.05 // warn if counts diverge by more than 5%

export async function runMeilisearchSyncJob(context?: JobContext): Promise<void> {
  const db = getDb()
  const client = getMeiliClient()
  const index = client.index(INDEX_NAME)

  const activeCount = await db.listing.count({ where: { status: 'active', isDuplicate: false } })

  await report(context, `[meili-sync] Full re-index started — ${activeCount} active non-duplicate listing(s) in DB`, {
    stage: 'syncing',
    current: 0,
    total: activeCount,
  })

  let synced = 0
  let cursor: string | undefined

  for (;;) {
    const rows = await db.listing.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    })
    if (rows.length === 0) break

    await index.addDocuments(rows.map(toDocument), { primaryKey: 'id' })
    synced += rows.length
    cursor = rows[rows.length - 1]!.id

    await report(context, `[meili-sync] Synced ${synced} listing(s)…`, {
      stage: 'syncing',
      current: Math.min(synced, activeCount),
      total: activeCount,
    })

    if (rows.length < BATCH_SIZE) break
  }

  // Monitoring: compare Meilisearch document count against active DB count
  try {
    const stats = await index.getStats()
    const meiliCount = stats.numberOfDocuments
    if (activeCount > 0) {
      const drift = Math.abs(meiliCount - activeCount) / activeCount
      if (drift > DRIFT_ALERT_THRESHOLD) {
        await report(
          context,
          `[meili-sync] WARN: document count drift ${(drift * 100).toFixed(1)}% — Meilisearch has ${meiliCount}, DB active+non-duplicate has ${activeCount}`,
        )
      }
    }
    await report(
      context,
      `[meili-sync] Done. ${synced} doc(s) upserted. Meilisearch index has ${meiliCount} total document(s).`,
      { stage: 'complete', current: activeCount, total: activeCount },
    )
  } catch {
    await report(context, `[meili-sync] Done. ${synced} doc(s) upserted. (Stats check unavailable.)`, {
      stage: 'complete',
      current: synced,
      total: synced,
    })
  }

  await db.$disconnect()
}
