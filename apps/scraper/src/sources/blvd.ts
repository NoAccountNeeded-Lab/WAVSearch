import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import type { SourceAdapter, ScrapeResult, StructureCheckResult } from '../engine/source-adapter.js'
import type { ConversionType, Listing, ListingCondition } from '@wav-search/types'

const SOURCE_ID = 'blvd'
const BASE_URL = 'https://www.blvd.com'
const LISTINGS_PATH = '/wheelchair-vans-for-sale'
const CARD_SEL = 'div.track_vehicle'

interface BlvdConfig {
  maxPages?: number
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
  private readonly maxPages: number

  constructor(previousHash: string | null = null, config: BlvdConfig = {}) {
    this.previousHash = previousHash
    this.maxPages = config.maxPages ?? Infinity
  }

  async checkStructure(): Promise<StructureCheckResult> {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`${BASE_URL}${LISTINGS_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      const signature = await page.evaluate((sel: string) => {
        const cards = document.querySelectorAll(sel)
        const first = cards[0]
        if (!first) return 'no-cards'
        const walk = (el: Element, depth: number): string => {
          if (depth > 3) return ''
          const kids = Array.from(el.children).map(c => walk(c, depth + 1)).join(',')
          return `${el.tagName}[${el.className}]${kids ? `{${kids}}` : ''}`
        }
        return `count:${cards.length}|${walk(first, 0)}`
      }, CARD_SEL)

      const currentHash = createHash('sha256').update(signature).digest('hex')
      return {
        changed: this.previousHash !== null && this.previousHash !== currentHash,
        currentHash,
        previousHash: this.previousHash,
      }
    } finally {
      await browser.close()
    }
  }

  async scrape(): Promise<ScrapeResult> {
    const browser = await chromium.launch()
    const listings: Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'>[] = []

    try {
      const page = await browser.newPage()
      let pageNum = 1

      while (pageNum <= this.maxPages) {
        const url =
          pageNum === 1
            ? `${BASE_URL}${LISTINGS_PATH}`
            : `${BASE_URL}${LISTINGS_PATH}?page=${pageNum}`

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

        const cards = await page.evaluate(
          ({ sel, baseUrl }: { sel: string; baseUrl: string }): RawCard[] => {
            const results: RawCard[] = []

            document.querySelectorAll(sel).forEach(card => {
              // VIN and source URL from the "Details" link
              const detailLink = card.querySelector('a.more-van-details-btn') as HTMLAnchorElement | null
              const href = detailLink?.getAttribute('href') ?? ''

              // The desktop h3 has the full "2024 Toyota Sienna FWD XLE".
              // Find the h3 whose text starts with a 4-digit year.
              const h3s = Array.from(card.querySelectorAll('h3'))
              const fullTitleH3 = h3s.find(h => /^\d{4}\s/.test(h.textContent?.trim() ?? ''))
              const fullTitle = fullTitleH3?.textContent?.trim() ?? ''

              const conversion = card.querySelector('h4.conversion')?.textContent?.trim() ?? ''

              // Vehicle condition badge — first newusedicon with data-title="Vehicle Condition"
              const condEl = card.querySelector(
                '.newusedicon[data-title="Vehicle Condition"]',
              ) as HTMLElement | null
              const condition = condEl?.classList.contains('Used') ? 'Used' : 'New'

              // vlistp label→value pairs (Miles / Price / Seller / Loc.)
              const fields: Record<string, string> = {}
              card.querySelectorAll('div.vlistp').forEach(label => {
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

        if (cards.length === 0) break

        for (const card of cards) {
          const listing = parseCard(card)
          if (listing) listings.push(listing)
        }

        const nextPage = pageNum + 1
        const hasNext = await page.evaluate(
          (n: number) => document.querySelector(`a[href*="page=${n}"]`) !== null,
          nextPage,
        )

        if (!hasNext) break
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

  return {
    sourceId: SOURCE_ID,
    sourceUrl: `${BASE_URL}${raw.href}`,
    externalId: raw.dataId || null,
    make,
    model,
    year,
    trim,
    vin,
    condition,
    sellerType: 'dealer',
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

export function parseConversionManufacturer(text: string): string | null {
  // "Driverge Driverge Flex Maxx Wheelchair Van Conversion" → "Driverge"
  const cleaned = text.replace(/wheelchair van conversion/i, '').trim()
  return cleaned.split(/\s+/)[0] || null
}
