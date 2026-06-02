import { chromium, type Page } from '@playwright/test'
import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import type { RampType, SaleStatus } from '@wav-search/types'
import { syncListings } from '@wav-search/search'
import { evaluateBlvdDetail, parseBlvdDetail } from '../sources/blvd-detail.js'
import { evaluateMwDetail, parseMwDetail } from '../sources/mobilityworks-detail.js'
import { getMeiliClient } from '../lib/meili.js'
import { report } from './job-progress.js'

const BATCH_SIZE = 100

type DetailResult = {
  color: string | null
  fuelType: string | null
  transmission: string | null
  rampType: RampType
  hasLift: boolean
  floorLoweringInches: number | null
  wheelchairCapacity: number | null
  handControls: boolean
  transferSeat: boolean
  description: string | null
  images: string[]
  zip: string | null
  dealerPhone: string | null
  saleStatus: SaleStatus
}

async function extractDetail(page: Page, url: string): Promise<DetailResult> {
  if (url.includes('mobilityworks.com')) {
    const raw = await evaluateMwDetail(page)
    return parseMwDetail(raw)
  }
  const raw = await evaluateBlvdDetail(page)
  return parseBlvdDetail(raw)
}

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
        await page.setContent(rawPage.html, { waitUntil: 'domcontentloaded' })
        const detail = await extractDetail(page, rawPage.url)

        const listing = await db.listing.findFirst({
          where: { sourceUrl: rawPage.url },
          select: { id: true, status: true },
        })

        if (listing) {
          // When a possibly_gone listing's detail page confirms it sold, mark it gone.
          // When the banner is gone (saleStatus=active), restore the listing to active.
          const confirmedSold =
            listing.status === 'possibly_gone' && detail.saleStatus === 'sold'
          const confirmedPending =
            listing.status === 'possibly_gone' && detail.saleStatus === 'pending'
          const restoredActive =
            listing.status === 'possibly_gone' && detail.saleStatus === 'active'

          const now = new Date()

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
              saleStatus: detail.saleStatus,
              ...(confirmedSold
                ? { status: 'gone', goneAt: now, soldAt: now }
                : confirmedPending
                  ? {}
                  : restoredActive
                    ? { status: 'active', goneAt: null }
                    : {}),
              detailScrapedAt: now,
            },
          })
          await syncListings([listing.id], db, getMeiliClient())
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
