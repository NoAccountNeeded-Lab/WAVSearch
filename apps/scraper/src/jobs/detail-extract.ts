import { chromium } from '@playwright/test'
import { getDb } from '@wav-search/db'
import { evaluateBlvdDetail, parseBlvdDetail } from '../sources/blvd-detail.js'

const BATCH_SIZE = 100

export async function runDetailExtractJob(sourceId: string): Promise<void> {
  const db = getDb()

  const rawPages = await db.rawPage.findMany({
    where: { sourceId, processedAt: null },
    select: { id: true, url: true, html: true },
    take: BATCH_SIZE,
  })

  if (rawPages.length === 0) {
    console.log(`[detail-extract] No raw pages pending for source ${sourceId}`)
    await db.$disconnect()
    return
  }

  console.log(`[detail-extract] Extracting ${rawPages.length} raw pages for source ${sourceId}`)

  const browser = await chromium.launch()
  let success = 0
  let failed = 0

  try {
    for (const rawPage of rawPages) {
      const page = await browser.newPage()

      try {
        // Load stored HTML directly — no network request
        await page.setContent(rawPage.html, { waitUntil: 'domcontentloaded' })
        const raw = await evaluateBlvdDetail(page)
        const detail = parseBlvdDetail(raw)

        const listing = await db.listing.findFirst({
          where: { sourceUrl: rawPage.url },
          select: { id: true },
        })

        if (listing) {
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
        } else {
          console.warn(`[detail-extract] No listing found for URL: ${rawPage.url}`)
        }

        await db.rawPage.update({
          where: { id: rawPage.id },
          data: { processedAt: new Date() },
        })

        success++
      } catch (err) {
        console.error(`[detail-extract] Failed ${rawPage.url}: ${err}`)
        failed++
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    await db.$disconnect()
  }

  console.log(`[detail-extract] Done. ${success} extracted, ${failed} failed.`)
}
