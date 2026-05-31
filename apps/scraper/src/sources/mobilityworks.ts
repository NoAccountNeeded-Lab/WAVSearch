import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import type { SourceAdapter, ScrapeResult, StructureCheckResult } from '../engine/source-adapter.js'
import type { ConversionType, Listing, ListingCondition, RampType } from '@wav-search/types'
import type { JobContext } from '@wav-search/queue'
import { report } from '../jobs/job-progress.js'

const SOURCE_ID = 'mobilityworks'
const BASE_URL = 'https://www.mobilityworks.com'
const LISTINGS_PATH = '/wheelchair-vans-for-sale/'

interface MobilityWorksConfig {
  maxPages?: number
}

// Shape returned from page.evaluate — must be JSON-serializable.
export interface RawCard {
  href: string       // e.g. "/wheelchair-vans-for-sale/2024-toyota-sienna-driverge-5tdyrkec8rs205440/"
  title: string      // e.g. "Used 2024 Toyota Sienna FWD XLE (New Conversion)"
  price: string      // e.g. "$71,991" | "Call for Price" | ""
  stock: string      // e.g. "RS205440"
  mileage: string    // e.g. "50094"
  color: string      // e.g. "Grey"
  convMake: string   // e.g. "Driverge"
  conversion: string // e.g. "Rear Entry Manual Fold Out"
  location: string   // e.g. "North Las Vegas NV" (market suffix already stripped)
  imageUrl: string
}

export class MobilityWorksAdapter implements SourceAdapter {
  readonly sourceId = SOURCE_ID
  readonly name = 'MobilityWorks'

  private readonly previousHash: string | null
  private readonly maxPages: number

  constructor(previousHash: string | null = null, config: MobilityWorksConfig = {}) {
    this.previousHash = previousHash
    this.maxPages = config.maxPages ?? Infinity
  }

  async checkStructure(): Promise<StructureCheckResult> {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`${BASE_URL}${LISTINGS_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForSelector('a[href*="/wheelchair-vans-for-sale/"]', { timeout: 15_000 }).catch(() => {})

      const signature = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href*="/wheelchair-vans-for-sale/"]'),
        ).filter(a => /-[A-Za-z0-9]{17}(?:\/)?$/.test(a.getAttribute('href') ?? ''))

        const first = anchors[0]
        if (!first) return 'no-listings'

        // Walk up to find card container that contains structured listing data
        let container: Element = first
        for (let i = 0; i < 6; i++) {
          if (!container.parentElement) break
          const parent = container.parentElement
          if (parent.textContent?.includes('Mileage') || parent.textContent?.includes('Stock:')) {
            container = parent
            break
          }
          container = parent
        }

        // function declaration avoids esbuild __name injection (unlike arrow-to-const)
        function walk(el: Element, depth: number): string {
          if (depth > 3) return ''
          const kids = Array.from(el.children).map(c => walk(c, depth + 1)).join(',')
          return `${el.tagName}[${el.className}]${kids ? `{${kids}}` : ''}`
        }

        return `count:${anchors.length}|${walk(container, 0)}`
      })

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
      let pageNum = 1
      await report(context, '[mobilityworks] Starting listing pagination', {
        stage: 'scraping',
        source: SOURCE_ID,
        page: pageNum,
        listings: 0,
      })

      while (pageNum <= this.maxPages) {
        const url =
          pageNum === 1
            ? `${BASE_URL}${LISTINGS_PATH}`
            : `${BASE_URL}${LISTINGS_PATH}page/${pageNum}/`

        await report(context, `[mobilityworks] Loading listing page ${pageNum}: ${url}`, {
          stage: 'scraping',
          source: SOURCE_ID,
          page: pageNum,
          listings: listings.length,
        })

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForSelector('a[href*="/wheelchair-vans-for-sale/"]', { timeout: 15_000 }).catch(() => {})

        const cards = await page.evaluate(
          ({ baseUrl }: { baseUrl: string }): RawCard[] => {
            const results: RawCard[] = []
            const seen = new Set<string>()

            const anchors = Array.from(
              document.querySelectorAll<HTMLAnchorElement>('a[href*="/wheelchair-vans-for-sale/"]'),
            ).filter(a => /-[A-Za-z0-9]{17}(?:\/)?$/.test(a.getAttribute('href') ?? ''))

            for (const anchor of anchors) {
              const href = anchor.getAttribute('href') ?? ''
              if (seen.has(href)) continue
              seen.add(href)

              // Walk up to find the card container (one that holds the structured key-value fields)
              let container: Element = anchor
              for (let i = 0; i < 6; i++) {
                if (!container.parentElement) break
                const parent = container.parentElement
                if (
                  parent.textContent?.includes('Mileage') ||
                  parent.textContent?.includes('Stock:')
                ) {
                  container = parent
                  break
                }
                container = parent
              }

              // Strip <sup> elements before reading text — MobilityWorks uses HTML <sup>1</sup>
              // footnote markers next to prices/mileage which get concatenated into textContent
              // as plain ASCII digits (e.g. "$71,991" + <sup>1</sup> → "$71,9911" → wrong parse).
              const clone = container.cloneNode(true) as Element
              clone.querySelectorAll('sup').forEach((s: Element) => s.remove())
              const txt = clone.textContent ?? ''
              // Strip unicode superscript footnote markers (¹²³⁴⁵⁶⁷⁸⁹) from a match group
              const sup = /[¹²³⁴-⁹]/g

              const heading = container.querySelector('h2, h3, h4')
              const title = (heading?.textContent ?? anchor.textContent ?? '').trim()

              const imgEl = container.querySelector('img')
              const imgSrc = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-src') ?? ''
              const imageUrl = imgSrc.startsWith('http') ? imgSrc : imgSrc ? `${baseUrl}${imgSrc}` : ''

              // Inline each field to avoid named arrow functions (esbuild __name injection breaks page.evaluate)
              // Strip market suffix from location: "North Las Vegas NV (Las Vegas)" → "North Las Vegas NV"
              const rawLocation = (txt.match(/Location\s*:?\s*([^\n]+)/i)?.[1] ?? '')
                .replace(sup, '').replace(/\s*\([^)]+\)$/, '').trim()

              results.push({
                href,
                title,
                price: (txt.match(/price\s*:?\s*([^\n]+)/i)?.[1] ?? '').replace(sup, '').trim(),
                stock: (txt.match(/Stock\s*:?\s*([^\n]+)/i)?.[1] ?? '').replace(sup, '').trim(),
                mileage: (txt.match(/Mileage\s*:?\s*([^\n]+)/i)?.[1] ?? '').replace(sup, '').trim(),
                color: (txt.match(/Color\s*:?\s*([^\n]+)/i)?.[1] ?? '').replace(sup, '').trim(),
                convMake: (txt.match(/Conv Make\s*:?\s*([^\n]+)/i)?.[1] ?? '').replace(sup, '').trim(),
                conversion: (txt.match(/Conversion\s*:?\s*([^\n]+)/i)?.[1] ?? '').replace(sup, '').trim(),
                location: rawLocation,
                imageUrl,
              })
            }

            return results
          },
          { baseUrl: BASE_URL },
        )

        await report(context, `[mobilityworks] Page ${pageNum} returned ${cards.length} card(s)`, {
          stage: 'scraping',
          source: SOURCE_ID,
          page: pageNum,
          cards: cards.length,
          listings: listings.length,
        })

        if (cards.length === 0) {
          await report(context, `[mobilityworks] No cards found on page ${pageNum}; stopping pagination`, {
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

        await report(context, `[mobilityworks] Parsed ${parsedOnPage}/${cards.length} card(s) on page ${pageNum}; ${listings.length} listing(s) total`, {
          stage: 'scraping',
          source: SOURCE_ID,
          page: pageNum,
          cards: cards.length,
          parsed: parsedOnPage,
          listings: listings.length,
        })

        const hasNext = await page.evaluate((nextPageNum: number) => {
          return Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).some(
            a =>
              a.href.includes(`/page/${nextPageNum}/`) ||
              a.textContent?.trim() === String(nextPageNum),
          )
        }, pageNum + 1)

        if (!hasNext) {
          await report(context, `[mobilityworks] No next page after page ${pageNum}; pagination complete`, {
            stage: 'scraping',
            source: SOURCE_ID,
            page: pageNum,
            listings: listings.length,
          })
          break
        }
        pageNum++
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

export function parseCard(raw: RawCard): Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'> | null {
  // VIN: last hyphen-delimited segment of the URL slug (must be exactly 17 alphanum chars)
  const slug = raw.href.replace(/\/+$/, '').split('/').pop() ?? ''
  const slugParts = slug.split('-')
  const vinCandidate = (slugParts[slugParts.length - 1] ?? '').toUpperCase()
  if (!/^[A-Z0-9]{17}$/.test(vinCandidate)) return null
  const vin = vinCandidate

  // Title: "Used 2024 Toyota Sienna FWD XLE (New Conversion)" — strip trailing parenthetical
  const titleClean = raw.title.replace(/\s*\([^)]+\)\s*$/, '').trim()
  const condPrefix = titleClean.match(/^(Used|New|Certified Pre[- ]Owned|CPO)\s+/i)
  const condition: ListingCondition = condPrefix?.[1]?.toLowerCase() === 'new' ? 'new' : 'used'
  const titleBody = titleClean.replace(/^(Used|New|Certified Pre[- ]Owned|CPO)\s+/i, '').trim()

  const parts = titleBody.split(/\s+/)
  const year = parseInt(parts[0] ?? '0', 10)
  const make = parts[1] ?? ''
  const model = parts[2] ?? ''
  const trim = parts.slice(3).join(' ') || null

  if (!make || !model || year < 1990 || year > new Date().getFullYear() + 2) return null

  const mileage = parseMileage(raw.mileage)
  const priceCents = parsePrice(raw.price)
  const { city, state } = parseLocation(raw.location)

  return {
    sourceId: SOURCE_ID,
    sourceUrl: raw.href.startsWith('http') ? raw.href : `${BASE_URL}${raw.href}`,
    externalId: raw.stock || vin,
    make,
    model,
    year,
    trim,
    vin,
    condition,
    sellerType: 'dealer',
    priceCents,
    mileage,
    color: raw.color || null,
    fuelType: null,
    transmission: null,
    wav: {
      conversionType: parseConversionType(raw.conversion),
      conversionManufacturer: raw.convMake || null,
      floorLoweringInches: null,
      rampType: parseRampType(raw.conversion),
      hasLift: false,
      handControls: false,
      transferSeat: false,
      wheelchairCapacity: null,
    },
    location: { zip: null, city, state, lat: null, lng: null },
    dealer: { name: 'MobilityWorks', phone: null, website: BASE_URL },
    images: raw.imageUrl ? [raw.imageUrl] : [],
    description: null,
    listedAt: new Date(),
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

export function parseRampType(text: string): RampType {
  const t = text.toLowerCase()
  if (t.includes('in-floor') || t.includes('in floor') || t.includes('infloor')) return 'in_floor'
  if (t.includes('fold out') || t.includes('fold-out')) return 'fold_out'
  if (t.includes('fold in') || t.includes('fold-in')) return 'fold_in'
  return 'unknown'
}

export function parseLocation(text: string): { city: string | null; state: string | null } {
  // "North Las Vegas NV" → city="North Las Vegas", state="NV"
  const m = text.trim().match(/^(.+?)\s+([A-Z]{2})$/)
  if (!m) return { city: text.trim() || null, state: null }
  return { city: m[1]! || null, state: m[2]! || null }
}
