import { chromium } from '@playwright/test'
import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import { evaluateBlvdDetail, parseBlvdDetail } from '../sources/blvd-detail.js'
import { report } from './job-progress.js'

const BATCH_SIZE = 100

export async function runDetailExtractJob(sourceId: string, context?: JobContext): Promise<void> {
  const db = getDb()

  const rawPages = await db.rawPage.findMany({
    where: { sourceId, processedAt: null },
    select: { id: true, url: true, html: true },
    take: BATCH_SIZE,
  })

  if (rawPages.length === 0) {
    await report(context, `[detail-extract] No raw pages pending for source ${sourceId}`, {
      stage: 'complete',
      current: 0,
      total: 0,
    })
    await db.$disconnect()
    return
  }

  await report(context, `[detail-extract] Extracting ${rawPages.length} raw pages for source ${sourceId}`, {
    stage: 'extracting',
    current: 0,
    total: rawPages.length,
  })

  const browser = await chromium.launch()
  let success = 0
  let failed = 0

  try {
    for (let i = 0; i < rawPages.length; i++) {
      const rawPage = rawPages[i]!
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
          await report(context, `[detail-extract] No listing found for URL: ${rawPage.url}`)
        }

        await db.rawPage.update({
          where: { id: rawPage.id },
          data: { processedAt: new Date() },
        })

        success++
      } catch (err) {
        await report(context, `[detail-extract] Failed ${rawPage.url}: ${err}`)
        failed++
      } finally {
        await page.close()
      }

      await report(context, `[detail-extract] Processed ${i + 1}/${rawPages.length} raw page(s)`, {
        stage: 'extracting',
        current: i + 1,
        total: rawPages.length,
      })
    }
  } finally {
    await browser.close()
    await db.$disconnect()
  }

  await report(context, `[detail-extract] Done. ${success} extracted, ${failed} failed.`, {
    stage: 'complete',
    current: rawPages.length,
    total: rawPages.length,
  })
}
