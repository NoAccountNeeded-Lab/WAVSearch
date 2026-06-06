import { getDb } from '@wivwav/db'
import type { Listing } from '@wivwav/db'
import type { JobContext } from '@wivwav/queue'
import { syncListings } from '@wivwav/search'
import { getMeiliClient } from '../lib/meili.js'
import { report } from './job-progress.js'
import { acquireListingLock, releaseListingLocks } from './listing-lock.js'

/** Count non-null optional fields as a completeness score. */
function completenessScore(listing: Listing): number {
  const optionalFields: (keyof Listing)[] = [
    'trim',
    'vin',
    'priceCents',
    'mileage',
    'color',
    'fuelType',
    'transmission',
    'conversionManufacturer',
    'floorLoweringInches',
    'wheelchairCapacity',
    'zip',
    'city',
    'state',
    'lat',
    'lng',
    'dealerName',
    'dealerPhone',
    'dealerWebsite',
    'description',
    'detailScrapedAt',
  ]
  return optionalFields.filter((f) => listing[f] != null).length + listing.images.length
}

export async function runDeduplicateJob(context?: JobContext): Promise<void> {
  const db = getDb()

  // Find all VINs present in more than one distinct source
  const rows = await db.$queryRaw<{ vin: string }[]>`
    SELECT vin
    FROM listings
    WHERE vin IS NOT NULL AND vin <> ''
    GROUP BY vin
    HAVING COUNT(DISTINCT "sourceId") > 1
  `

  await report(context, `[deduplicate] ${rows.length} VIN(s) have cross-source duplicates`, {
    stage: 'deduplicating',
    current: 0,
    total: rows.length,
  })

  let canonicalised = 0
  let marked = 0
  let skippedGroups = 0
  const touchedIds: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const { vin } = rows[i]!
    const group = await db.listing.findMany({ where: { vin } })

    // Acquire a lock on every listing in this VIN group before mutating them.
    // If any listing is actively locked by another job, skip the entire group
    // to avoid partial deduplication (which could leave inconsistent canonical pointers).
    const lockedIds: string[] = []
    let groupLockFailed = false

    for (const listing of group) {
      const acquired = await acquireListingLock(db, listing.id)
      if (acquired) {
        lockedIds.push(listing.id)
      } else {
        groupLockFailed = true
        break
      }
    }

    if (groupLockFailed) {
      // Release any partially acquired locks and skip this group
      await releaseListingLocks(db, lockedIds)
      skippedGroups++
      await report(context, `[deduplicate] ${i + 1}/${rows.length} VIN group(s) — VIN ${vin}: one or more listings locked, skipping group`, {
        stage: 'deduplicating',
        current: i + 1,
        total: rows.length,
      })
      continue
    }

    // Pick the listing with the highest completeness score as canonical
    const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a))
    const canonical = sorted[0]!
    const duplicates = sorted.slice(1)

    try {
      // Promote canonical: clear duplicate flags in case it was previously demoted
      await db.listing.update({
        where: { id: canonical.id },
        data: { isDuplicate: false, canonicalId: null },
      })
      touchedIds.push(canonical.id)
      canonicalised++

      for (const dupe of duplicates) {
        await db.listing.update({
          where: { id: dupe.id },
          data: { isDuplicate: true, canonicalId: canonical.id },
        })
        touchedIds.push(dupe.id)
        marked++
      }
    } finally {
      await releaseListingLocks(db, lockedIds)
    }

    await report(context, `[deduplicate] Processed ${i + 1}/${rows.length} VIN group(s)`, {
      stage: 'deduplicating',
      current: i + 1,
      total: rows.length,
    })
  }

  await syncListings(touchedIds, db, getMeiliClient())
  await report(context, `[deduplicate] Done. ${canonicalised} canonicals, ${marked} duplicates marked, ${skippedGroups} group(s) skipped (locked). ${touchedIds.length} listing(s) synced to Meilisearch.`, {
    stage: 'complete',
    current: rows.length,
    total: rows.length,
  })
  await db.$disconnect()
}
