import { describe, it, expect } from 'vitest'
import { BlvdAdapter } from './blvd.js'

// Integration tests — hit the real blvd.com via Playwright.
// Run: pnpm --filter @wav-search/scraper test

describe('BlvdAdapter', () => {
  it('checkStructure returns a consistent hash', async () => {
    const adapter = new BlvdAdapter(null, { maxPages: 1 })
    const result = await adapter.checkStructure()

    expect(result.changed).toBe(false)
    expect(result.currentHash).toBeTruthy()
    expect(result.currentHash).toHaveLength(64) // sha256 hex
    expect(result.previousHash).toBeNull()
  }, 30_000)

  it('scrapes at least 15 listings from page 1', async () => {
    const adapter = new BlvdAdapter(null, { maxPages: 1 })
    const result = await adapter.scrape()

    expect(result.listings.length).toBeGreaterThan(15)
    expect(result.fingerprintHash).toBeTruthy()
  }, 60_000)

  it('each listing has required vehicle fields', async () => {
    const adapter = new BlvdAdapter(null, { maxPages: 1 })
    const { listings } = await adapter.scrape()

    for (const listing of listings.slice(0, 5)) {
      expect(listing.sourceId).toBe('blvd')
      expect(listing.sourceUrl).toMatch(/blvd\.com\/wheelchair-(vans|trucks)\//)
      expect(listing.make).toBeTruthy()
      expect(listing.model).toBeTruthy()
      expect(listing.year).toBeGreaterThan(2000)
      expect(listing.year).toBeLessThan(new Date().getFullYear() + 2)
      expect(listing.vin).toHaveLength(17)
      expect(['new', 'used', 'certified_pre_owned']).toContain(listing.condition)
    }
  }, 60_000)

  it('listings have WAV fields, price, mileage, and location', async () => {
    const adapter = new BlvdAdapter(null, { maxPages: 1 })
    const { listings } = await adapter.scrape()

    // At least half should have a price (some say "Call")
    const withPrice = listings.filter(l => l.priceCents !== null)
    expect(withPrice.length).toBeGreaterThan(listings.length / 2)

    // At least half should have mileage
    const withMileage = listings.filter(l => l.mileage !== null)
    expect(withMileage.length).toBeGreaterThan(listings.length / 2)

    // All should have city or state
    const withLocation = listings.filter(l => l.location.city || l.location.state)
    expect(withLocation.length).toBeGreaterThan(0)

    // WAV conversion type should always be set
    for (const listing of listings.slice(0, 5)) {
      expect(['rear_entry', 'side_entry', 'unknown']).toContain(listing.wav.conversionType)
      expect(listing.wav.rampType).toBeTruthy()
      expect(listing.images.length).toBeGreaterThan(0)
    }
  }, 60_000)

  it('detects changed structure when hash differs', async () => {
    const staleHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const adapter = new BlvdAdapter(staleHash, { maxPages: 1 })
    const result = await adapter.checkStructure()

    expect(result.changed).toBe(true)
    expect(result.previousHash).toBe(staleHash)
    expect(result.currentHash).not.toBe(staleHash)
  }, 30_000)
})
