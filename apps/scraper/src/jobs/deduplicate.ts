import { getDb } from '@wav-search/db'
import type { Listing } from '@wav-search/db'

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

export async function runDeduplicateJob(): Promise<void> {
  const db = getDb()

  // Find all VINs present in more than one distinct source
  const rows = await db.$queryRaw<{ vin: string }[]>`
    SELECT vin
    FROM listings
    WHERE vin IS NOT NULL AND vin <> ''
    GROUP BY vin
    HAVING COUNT(DISTINCT "sourceId") > 1
  `

  console.log(`[deduplicate] ${rows.length} VINs have cross-source duplicates`)

  let canonicalised = 0
  let marked = 0

  for (const { vin } of rows) {
    const group = await db.listing.findMany({ where: { vin } })

    // Pick the listing with the highest completeness score as canonical
    const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a))
    const canonical = sorted[0]!
    const duplicates = sorted.slice(1)

    // Promote canonical: clear duplicate flags in case it was previously demoted
    await db.listing.update({
      where: { id: canonical.id },
      data: { isDuplicate: false, canonicalId: null },
    })
    canonicalised++

    for (const dupe of duplicates) {
      await db.listing.update({
        where: { id: dupe.id },
        data: { isDuplicate: true, canonicalId: canonical.id },
      })
      marked++
    }
  }

  console.log(`[deduplicate] Done. ${canonicalised} canonicals, ${marked} duplicates marked.`)
  await db.$disconnect()
}
