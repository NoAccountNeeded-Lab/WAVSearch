import { chromium } from '@playwright/test'
import { getDb } from '@wav-search/db'
import { evaluateBlvdDetail, parseBlvdDetail } from '../sources/blvd-detail.js'

const BATCH_SIZE = 50
const RATE_LIMIT_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runDetailScrapeJob(sourceId: string): Promise<void> {
  const db = getDb()

  const listings = await db.listing.findMany({
    where: { sourceId, detailScrapedAt: null },
    select: { id: true, sourceUrl: true },
    take: BATCH_SIZE,
    orderBy: { listedAt: 'asc' },
  })

  if (listings.length === 0) {
    console.log(`[detail-scrape] No listings pending for source ${sourceId}`)
    await db.$disconnect()
    return
  }

  console.log(`[detail-scrape] Processing ${listings.length} listings for source ${sourceId}`)

  const browser = await chromium.launch()
  let success = 0
  let failed = 0

  try {
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i]!
      const page = await browser.newPage()

      try {
        const raw = await evaluateBlvdDetail(page, listing.sourceUrl)
        const detail = parseBlvdDetail(raw)

        await db.listing.update({
          where: { id: listing.id },
          data: {
            color: detail.color,
            fuelType: detail.fuelType,
            transmission: detail.transmission,
            rampType: detail.rampType,
            hasLift: detail.hasLift,
            floorLoweringInches: detail.floorLoweringInches,
            handControls: detail.handControls,
            transferSeat: detail.transferSeat,
            wheelchairCapacity: detail.wheelchairCapacity,
            description: detail.description,
            ...(detail.images.length > 0 && { images: detail.images }),
            ...(detail.zip && { zip: detail.zip }),
            ...(detail.dealerPhone && { dealerPhone: detail.dealerPhone }),
            detailScrapedAt: new Date(),
          },
        })

        success++
      } catch (err) {
        console.error(`[detail-scrape] Failed ${listing.id} (${listing.sourceUrl}): ${err}`)
        failed++
      } finally {
        await page.close()
      }

      if (i < listings.length - 1) await sleep(RATE_LIMIT_MS)
    }
  } finally {
    await browser.close()
    await db.$disconnect()
  }

  console.log(`[detail-scrape] Done. ${success} succeeded, ${failed} failed.`)
}
