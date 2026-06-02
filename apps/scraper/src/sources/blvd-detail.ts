import type { Page } from '@playwright/test'
import type { RampType, SaleStatus } from '@wav-search/types'

const BASE_URL = 'https://www.blvd.com'

export interface RawDetail {
  specs: Record<string, string>
  descriptionText: string
  imageUrls: string[]
  dealerPhone: string
  dealerAddressText: string
  statusBannerText: string
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
  saleStatus: SaleStatus
}

export function parseSaleStatus(bannerText: string): SaleStatus {
  const t = bannerText.toLowerCase()
  if (t.includes('pending') || t.includes('under contract')) return 'pending'
  if (t.includes('sold') || t.includes('no longer available') || t.includes('unavailable')) return 'sold'
  return 'active'
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
    saleStatus: parseSaleStatus(raw.statusBannerText),
  }
}

export async function evaluateBlvdDetail(page: Page): Promise<RawDetail> {
  return page.evaluate((baseUrl: string): RawDetail => {
    // Specs: table rows with label in first td, value in second td
    const specs: Record<string, string> = {}
    document.querySelectorAll('table tr').forEach(tr => {
      const cells = Array.from(tr.querySelectorAll('td'))
      if (cells.length >= 2) {
        const label = cells[0]?.textContent?.trim()
        const value = cells[1]?.textContent?.trim()
        if (label && value) specs[label] = value
      }
    })

    // Description: walk up from "Vehicle Description" h2 to find a <p> in its ancestor
    let descriptionText = ''
    const descH2 = Array.from(document.querySelectorAll('h2')).find(h =>
      /Vehicle Description/i.test(h.textContent ?? '')
    )
    if (descH2) {
      let node: Element | null = descH2
      while (node.parentElement) {
        node = node.parentElement
        const p = node.querySelector('p')
        if (p?.textContent && p.textContent.length > 50) {
          descriptionText = p.textContent.trim()
          break
        }
      }
    }

    // Gallery: all <a href> links pointing to large images, deduped
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

    // Dealer address / zip from the seller sidebar block
    const sidebar = document.querySelector('.sidebarfeature') as HTMLElement | null
    const dealerAddressText = sidebar?.innerText?.replace(/\s+/g, ' ').trim() ?? ''

    // Sale status banner: sold/pending overlays that appear on detail pages
    // BLVD uses a ribbon or badge element with class containing "sold", "pending", or "status"
    const bannerCandidates = [
      document.querySelector('[class*="sold"]'),
      document.querySelector('[class*="pending"]'),
      document.querySelector('[class*="unavailable"]'),
      document.querySelector('[class*="status-badge"]'),
      document.querySelector('[class*="sale-status"]'),
    ]
    const statusBannerEl = bannerCandidates.find(function (el) { return el !== null }) ?? null
    const statusBannerText = statusBannerEl?.textContent?.trim() ?? ''

    return { specs, descriptionText, imageUrls, dealerPhone, dealerAddressText, statusBannerText }
  }, BASE_URL)
}
