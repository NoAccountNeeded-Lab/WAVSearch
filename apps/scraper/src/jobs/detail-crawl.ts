import { chromium } from '@playwright/test'
import { getDb } from '@wav-search/db'
import type { JobContext, QueueAdapter } from '@wav-search/queue'
import { report } from './job-progress.js'

const BATCH_SIZE = 50
const RATE_LIMIT_MS = 2000
const STALE_DETAIL_DAYS = 30

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runDetailCrawlJob(sourceId: string, context?: JobContext, listingSyncQueue?: QueueAdapter): Promise<void> {
  const db = getDb()

  const staleThreshold = new Date(Date.now() - STALE_DETAIL_DAYS * 24 * 60 * 60 * 1000)
  const listings = await db.listing.findMany({
    where: {
      sourceId,
      status: { not: 'gone' },
      OR: [
        { detailScrapedAt: null },
        { detailScrapedAt: { lt: staleThreshold } },
      ],
    },
    select: { sourceUrl: true, status: true },
    take: BATCH_SIZE,
    orderBy: { listedAt: 'asc' },
  })

  if (listings.length === 0) {
    await report(context, `[detail-crawl] No listings pending for source ${sourceId}`, {
      stage: 'complete',
      current: 0,
      total: 0,
    })
    await db.$disconnect()
    return
  }

  await report(context, `[detail-crawl] Crawling ${listings.length} pages for source ${sourceId}`, {
    stage: 'crawling',
    current: 0,
    total: listings.length,
  })

  const browser = await chromium.launch()
  let success = 0
  let failed = 0

  try {
    for (let i = 0; i < listings.length; i++) {
      const { sourceUrl, status } = listings[i]!
      const page = await browser.newPage()

      try {
        let response: Awaited<ReturnType<typeof page.goto>> = null
        let navFailed = false

        try {
          // networkidle ensures the description text (loaded async) is present before we store
          response = await page.goto(sourceUrl, { waitUntil: 'networkidle', timeout: 45_000 })
        } catch (navErr) {
          // Transient network/timeout failure — leave possibly_gone for the next crawl to retry
          navFailed = true
          await report(context, `[detail-crawl] Navigation error ${sourceUrl}: ${navErr}`)
          if (status !== 'possibly_gone') failed++
        }

        if (!navFailed) {
          const finalUrl = page.url()
          const is404 = response !== null && response.status() === 404
          const isOffDomainRedirect =
            new URL(finalUrl).hostname !== new URL(sourceUrl).hostname

          if (is404 || isOffDomainRedirect) {
            // Authoritative gone signal — mark directly without waiting for extract
            await db.listing.updateMany({
              where: { sourceUrl, status: { not: 'gone' } },
              data: { status: 'gone', goneAt: new Date() },
            })
            await listingSyncQueue?.add({})
            await report(context, `[detail-crawl] ${is404 ? '404' : 'Off-domain redirect'} — marked ${sourceUrl} as gone`)
          } else {
            const html = await page.content()
            await db.rawPage.upsert({
              where: { url: sourceUrl },
              // Reset processedAt so the extract job re-processes on re-crawl
              update: { html, scrapedAt: new Date(), processedAt: null },
              create: { url: sourceUrl, sourceId, html },
            })
          }
          success++
        }
      } catch (err) {
        await report(context, `[detail-crawl] Failed ${sourceUrl}: ${err}`)
        failed++
      } finally {
        await page.close()
      }

      await report(context, `[detail-crawl] Processed ${i + 1}/${listings.length} page(s)`, {
        stage: 'crawling',
        current: i + 1,
        total: listings.length,
      })

      if (i < listings.length - 1) await sleep(RATE_LIMIT_MS)
    }
  } finally {
    await browser.close()
    await db.$disconnect()
  }

  await report(context, `[detail-crawl] Done. ${success} crawled, ${failed} failed.`, {
    stage: 'complete',
    current: listings.length,
    total: listings.length,
  })
}
