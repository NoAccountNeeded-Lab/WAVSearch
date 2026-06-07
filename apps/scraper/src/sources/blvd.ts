import { chromium, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import type { SourceAdapter, ScrapeResult, StructureCheckResult, Page1CheckResult } from '../engine/source-adapter.js'
import type { ConversionType, Listing, ListingCondition } from '@wivwav/types'
import type { JobContext } from '@wivwav/queue'
import { report } from '../jobs/job-progress.js'

const SOURCE_ID = 'blvd'
const BASE_URL = 'https://www.blvd.com'
const LISTINGS_PATH = '/wheelchair-vans-for-sale'
const FSBO_LISTINGS_PATH = '/wheelchair-vans-for-sale-by-owner'
const LISTING_PATHS = [LISTINGS_PATH, FSBO_LISTINGS_PATH] as const
const CARD_SEL = 'div.track_vehicle'
const NAVIGATION_TIMEOUT_MS = 30_000

interface BlvdConfig {
  maxPages?: number
  previousPage1Hash?: string | null
}

// Shape returned from page.evaluate — must be JSON-serializable.
export interface RawCard {
  href: string
  fullTitle: string   // "2024 Toyota Sienna FWD XLE" from desktop h3
  conversion: string  // "Driverge Flex Maxx Wheelchair Van Conversion"
  condition: string   // "Used" | "New" from Vehicle Condition indicator
  miles: string       // "50,094"
  price: string       // "$71,991" | "Call" | ""
  seller: string      // "MobilityWorks"
  location: string    // "North Las Vegas, NV"
  imageUrl: string
  dataId: string
}

export class BlvdAdapter implements SourceAdapter {
  readonly sourceId = SOURCE_ID
  readonly name = 'BLVD.com'

  private readonly previousHash: string | null
  private readonly previousPage1Hash: string | null
  private readonly maxPages: number

  constructor(previousHash: string | null = null, config: BlvdConfig = {}) {
    this.previousHash = previousHash
    this.previousPage1Hash = config.previousPage1Hash ?? null
    this.maxPages = config.maxPages ?? Infinity
  }

  async checkPage1(): Promise<Page1CheckResult> {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()

      const entries: string[] = []
      for (const listingPath of LISTING_PATHS) {
        await page.goto(getPage1CheckUrl(listingPath), { waitUntil: 'domcontentloaded', timeout: 30_000 })

        // Hash "id:price" per card so a price change triggers a full crawl even when
        // the set of listings on page 1 is unchanged.
        const pathEntries = await page.evaluate(function (sel: string): string[] {
          return Array.from(document.querySelectorAll(sel)).map(function (card) {
            const id = card.getAttribute('data-id') ?? ''
            if (!id) return ''
            let price = ''
            card.querySelectorAll('div.vlistp').forEach(function (label) {
              const h4 = label.nextElementSibling
              if (label.textContent?.trim() === 'Price' && h4?.tagName === 'H4') {
                price = h4.textContent?.trim() ?? ''
              }
            })
            return `${id}:${price}`
          }).filter(function (s) { return s.length > 0 })
        }, CARD_SEL)

        entries.push(...pathEntries.map(entry => `${listingPath}:${entry}`))
      }

      const currentHash = hashPage1Entries(entries)
      const changed = this.previousPage1Hash === null || this.previousPage1Hash !== currentHash
      return { currentHash, changed }
    } finally {
      await browser.close()
    }
  }

  async checkStructure(): Promise<StructureCheckResult> {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`${BASE_URL}${LISTINGS_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      const signature = await page.evaluate(function (sel: string): string {
        const cards = document.querySelectorAll(sel)
        const first = cards[0]
        if (!first) return 'no-cards'
        // Iterative DFS — tsx's esbuild injects __name() for named function declarations,
        // which is undefined in the Playwright browser sandbox where only the function body
        // is serialized, not the module-level helper.
        const parts: string[] = []
        const stack: Array<[Element, number]> = [[first, 0]]
        while (stack.length > 0) {
          const item = stack.pop()!
          const el = item[0]
          const depth = item[1]
          if (depth > 3) continue
          parts.push(`${el.tagName}[${el.className}]`)
          for (let i = el.children.length - 1; i >= 0; i--) {
            stack.push([el.children[i]!, depth + 1])
          }
        }
        return `count:${cards.length}|${parts.join(',')}`
      }, CARD_SEL)

      const currentHash = createHash('sha256').update(signature).digest('hex')
      const changed = this.previousHash !== null && this.previousHash !== currentHash
      return {
        changed,
        currentHash,
        previousHash: this.previousHash,
        ...(changed ? { sampleHtml: await page.content() } : {}),
      }
    } finally {
      await browser.close()
    }
  }

  async scrape(context?: JobContext): Promise<ScrapeResult> {
    const browser = await chromium.launch()
    const listings: Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'>[] = []

    try {
      const page = await browser.newPage()
      await report(context, '[blvd] Starting listing pagination', {
        stage: 'scraping',
        source: SOURCE_ID,
        page: 1,
        listings: 0,
      })

      for (const listingPath of LISTING_PATHS) {
        let pageNum = 1

        while (pageNum <= this.maxPages) {
          const url = getListingPageUrl(listingPath, pageNum)

          await report(context, `[blvd] Loading listing page ${pageNum}: ${url}`, {
            stage: 'scraping',
            source: SOURCE_ID,
            page: pageNum,
            listings: listings.length,
          })

          try {
            await gotoListingPage(page, url)
          } catch (err) {
            if (pageNum > 1 && isNavigationTimeout(err)) {
              await report(context, `[blvd] Stopping pagination after timeout loading page ${pageNum}: ${url}`, {
                stage: 'scraping',
                source: SOURCE_ID,
                page: pageNum,
                listings: listings.length,
                reason: 'page_timeout',
              })
              break
            }
            throw err
          }

          const cards = await page.evaluate(
            function ({ sel, baseUrl }: { sel: string; baseUrl: string }): RawCard[] {
              const results: RawCard[] = []

              document.querySelectorAll(sel).forEach(function (card) {
                // VIN and source URL from the "Details" link
                const detailLink = card.querySelector('a.more-van-details-btn') as HTMLAnchorElement | null
                const href = detailLink?.getAttribute('href') ?? ''

                // The desktop h3 has the full "2024 Toyota Sienna FWD XLE".
                // Find the h3 whose text starts with a 4-digit year.
                const h3s = Array.from(card.querySelectorAll('h3'))
                const fullTitleH3 = h3s.find(function (h) {
                  return /^\d{4}\s/.test(h.textContent?.trim() ?? '')
                })
                const fullTitle = fullTitleH3?.textContent?.trim() ?? ''

                const conversion = card.querySelector('h4.conversion')?.textContent?.trim() ?? ''

                // Vehicle condition badge — first newusedicon with data-title="Vehicle Condition"
                const condEl = card.querySelector(
                  '.newusedicon[data-title="Vehicle Condition"]',
                ) as HTMLElement | null
                const condition = condEl?.classList.contains('Used') ? 'Used' : 'New'

                // vlistp label→value pairs (Miles / Price / Seller / Loc.)
                const fields: Record<string, string> = {}
                card.querySelectorAll('div.vlistp').forEach(function (label) {
                  const h4 = label.nextElementSibling
                  if (h4?.tagName === 'H4') {
                    fields[label.textContent?.trim() ?? ''] = h4.textContent?.trim() ?? ''
                  }
                })

                const imgEl = card.querySelector('img.img-responsive') as HTMLImageElement | null
                const imgSrc = imgEl?.getAttribute('src') ?? ''
                const imageUrl = imgSrc.startsWith('http') ? imgSrc : `${baseUrl}${imgSrc}`

                results.push({
                  href,
                  fullTitle,
                  conversion,
                  condition,
                  miles: fields['Miles'] ?? '',
                  price: fields['Price'] ?? '',
                  seller: fields['Seller'] ?? '',
                  location: fields['Loc.'] ?? '',
                  imageUrl,
                  dataId: card.getAttribute('data-id') ?? '',
                })
              })

              return results
            },
            { sel: CARD_SEL, baseUrl: BASE_URL },
          )

          await report(context, `[blvd] Page ${pageNum} returned ${cards.length} card(s)`, {
            stage: 'scraping',
            source: SOURCE_ID,
            page: pageNum,
            cards: cards.length,
            listings: listings.length,
          })

          if (cards.length === 0) {
            await report(context, `[blvd] No cards found on page ${pageNum}; stopping pagination`, {
              stage: 'scraping',
              source: SOURCE_ID,
              page: pageNum,
              listings: listings.length,
              reason: 'no_cards',
            })
            break
          }

          let parsedOnPage = 0
          for (const card of cards) {
            const listing = parseCard(card)
            if (listing) {
              listings.push(listing)
              parsedOnPage++
            }
          }

          await report(context, `[blvd] Parsed ${parsedOnPage}/${cards.length} card(s) on page ${pageNum}; ${listings.length} listing(s) total`, {
            stage: 'scraping',
            source: SOURCE_ID,
            page: pageNum,
            cards: cards.length,
            parsed: parsedOnPage,
            listings: listings.length,
          })

          const hasNext = await page.evaluate(
            function () {
              return Array.from(document.querySelectorAll('a')).some(function (a) {
                return a.textContent?.trim() === 'Next'
              })
            },
          )

          if (!hasNext) {
            await report(context, `[blvd] No next page after page ${pageNum}; pagination complete`, {
              stage: 'scraping',
              source: SOURCE_ID,
              page: pageNum,
              listings: listings.length,
            })
            break
          }
          pageNum++
        }
      }

      const fingerprintHash = createHash('sha256')
        .update(listings.map(l => l.vin ?? l.sourceUrl).join('|'))
        .digest('hex')

      return { listings, fingerprintHash }
    } finally {
      await browser.close()
    }
  }
}

async function gotoListingPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS })
}

function getPage1CheckUrl(path: string): string {
  // BLVD's public listing page does not expose a working newest-sort query parameter.
  return `${BASE_URL}${path}`
}

function getListingPageUrl(path: string, pageNum: number): string {
  return pageNum === 1 ? `${BASE_URL}${path}` : `${BASE_URL}${path}?page=${pageNum}`
}

export function hashPage1Entries(entries: string[]): string {
  return createHash('sha256').update(entries.sort().join(',') || 'empty').digest('hex')
}

export function isNavigationTimeout(err: unknown): boolean {
  return err instanceof Error && /\bTimeout \d+ms exceeded\b/.test(err.message)
}

export function parseCard(raw: RawCard): Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'> | null {
  // VIN is the last path segment — must be exactly 17 alphanumeric chars.
  const vin = raw.href.split('/').pop() ?? ''
  if (!/^[A-Z0-9]{17}$/i.test(vin)) return null

  // "2024 Toyota Sienna FWD XLE" → year, make, model, trim
  const parts = raw.fullTitle.trim().split(/\s+/)
  const year = parseInt(parts[0] ?? '0', 10)
  const make = parts[1] ?? ''
  const model = parts[2] ?? ''
  const trim = parts.slice(3).join(' ') || null

  if (!make || !model || year < 1990 || year > new Date().getFullYear() + 2) return null

  const mileage = parseMileage(raw.miles)
  const priceCents = parsePrice(raw.price)

  const locationParts = raw.location.split(',').map(s => s.trim())
  const city = locationParts[0] || null
  const state = locationParts[1] || null

  const condition: ListingCondition = raw.condition === 'New' ? 'new' : 'used'
  const conversionType = parseConversionType(raw.conversion)
  const conversionManufacturer = parseConversionManufacturer(raw.conversion)

  const sourceUrl = raw.href.startsWith('http') ? raw.href : `${BASE_URL}${raw.href}`
  const isPrivateSeller = /^for sale by owner$/i.test(raw.seller.trim())
  const externalId = raw.dataId || null

  return {
    sourceId: SOURCE_ID,
    sourceUrl,
    buyerUrl: sourceUrl,
    externalId,
    sourceRecordKey: externalId ?? normalizeSourceUrl(sourceUrl),
    make,
    model,
    year,
    trim,
    vin,
    condition,
    sellerType: isPrivateSeller ? 'private' : 'dealer',
    priceCents,
    mileage,
    color: null,
    fuelType: null,
    transmission: null,
    wav: {
      conversionType,
      conversionManufacturer,
      floorLoweringInches: null,
      rampType: 'unknown',
      hasLift: false,
      handControls: false,
      transferSeat: false,
      wheelchairCapacity: null,
    },
    location: { zip: null, city, state, lat: null, lng: null },
    dealer: { name: raw.seller || null, phone: null, website: null },
    images: raw.imageUrl ? [raw.imageUrl] : [],
    description: null,
    saleStatus: 'active',
    soldAt: null,
    listedAt: new Date(),
  }
}

/** Strip query string and trailing slash for a stable URL-based record key. */
export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`.replace(/\/$/, '')
  } catch {
    return url
  }
}

export function parseMileage(text: string): number | null {
  const m = text.replace(/,/g, '').match(/(\d+)/)
  return m ? parseInt(m[1]!, 10) : null
}

export function parsePrice(text: string): number | null {
  const m = text.replace(/,/g, '').match(/(\d+)/)
  return m ? parseInt(m[1]!, 10) * 100 : null
}

export function parseConversionType(text: string): ConversionType {
  const t = text.toLowerCase()
  if (t.includes('rear entry') || t.includes('rear-entry')) return 'rear_entry'
  if (t.includes('side entry') || t.includes('side-entry')) return 'side_entry'
  return 'unknown'
}

export function parseConversionManufacturer(text: string): string | null {
  // "Driverge Driverge Flex Maxx Wheelchair Van Conversion" → "Driverge"
  const cleaned = text.replace(/wheelchair van conversion/i, '').trim()
  return cleaned.split(/\s+/)[0] || null
}
