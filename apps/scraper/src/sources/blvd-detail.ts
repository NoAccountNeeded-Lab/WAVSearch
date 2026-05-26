import type { Page } from '@playwright/test'
import type { RampType } from '@wav-search/types'

const BASE_URL = 'https://www.blvd.com'

export interface RawDetail {
  specs: Record<string, string>
  descriptionText: string
  imageUrls: string[]
  dealerPhone: string
  dealerAddressText: string
}

export interface BlvdDetailFields {
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
}

export function parseRampType(text: string): RampType {
  const t = text.toLowerCase()
  if (t.includes('in-floor') || t.includes('in floor')) return 'in_floor'
  if (t.includes('fold out') || t.includes('fold-out')) return 'fold_out'
  if (t.includes('fold in') || t.includes('fold-in')) return 'fold_in'
  return 'unknown'
}

export function parseFloorLowering(text: string): number | null {
  // "14 inch floor lowering" / "14" floor lowering" / "floor lowered 10 inches"
  const before = text.match(/(\d+)\s*(?:"|in\.?|inch(?:es)?)\s+floor\s*(?:low|drop)/i)
  if (before) return parseInt(before[1]!, 10)
  const after = text.match(/floor\s*(?:low\w*|drop\w*)\s+(?:of\s+)?(\d+)/i)
  if (after) return parseInt(after[1]!, 10)
  return null
}

export function parseZip(address: string): string | null {
  const m = address.match(/\b(\d{5})\b/)
  return m ? m[1]! : null
}

export function parseBlvdDetail(raw: RawDetail): BlvdDetailFields {
  const spec = (key: string): string | null => raw.specs[key]?.trim() || null
  const desc = raw.descriptionText
  const t = desc.toLowerCase()

  return {
    color: spec('Color'),
    fuelType: spec('Engine'),
    transmission: spec('Transmission'),
    rampType: parseRampType(desc),
    hasLift: /\blift\b/i.test(desc),
    floorLoweringInches: parseFloorLowering(desc),
    wheelchairCapacity: null,
    handControls: /hand\s+control/i.test(t),
    transferSeat: /transfer\s+seat/i.test(t),
    description: desc || null,
    images: raw.imageUrls,
    zip: parseZip(raw.dealerAddressText),
    dealerPhone: raw.dealerPhone || null,
  }
}

export async function evaluateBlvdDetail(page: Page, url: string): Promise<RawDetail> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  return page.evaluate((baseUrl: string): RawDetail => {
    // Collect all <strong>Label</strong> followed by text-node value
    const specs: Record<string, string> = {}
    document.querySelectorAll('strong').forEach(el => {
      const label = el.textContent?.trim()
      if (!label) return
      let node: Node | null = el.nextSibling
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const val = node.textContent?.trim()
          if (val) { specs[label] = val; break }
        }
        node = node.nextSibling
      }
    })

    // Description: text of the element following a "Description" heading
    const headings = Array.from(document.querySelectorAll('h2, h3, h4'))
    const descHeading = headings.find(h => /description/i.test(h.textContent ?? ''))
    const descEl = descHeading?.nextElementSibling
    const descriptionText = descEl?.textContent?.trim() ?? ''

    // Gallery: all <a href> links pointing to large images
    const seen = new Set<string>()
    const imageUrls: string[] = []
    document.querySelectorAll<HTMLAnchorElement>('a[href*="_large.jpg"]').forEach(a => {
      const href = a.getAttribute('href') ?? ''
      const abs = href.startsWith('http') ? href : `${baseUrl}${href}`
      if (!seen.has(abs)) { seen.add(abs); imageUrls.push(abs) }
    })

    // Dealer phone from tel: link
    const phoneEl = document.querySelector<HTMLAnchorElement>('a[href^="tel:"]')
    const dealerPhone = phoneEl?.textContent?.trim() ?? ''

    // Dealer address
    const addressEl = document.querySelector('address')
    const dealerAddressText = addressEl?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

    return { specs, descriptionText, imageUrls, dealerPhone, dealerAddressText }
  }, BASE_URL)
}
