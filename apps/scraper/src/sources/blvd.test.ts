import { describe, it, expect } from 'vitest'
import {
  parseMileage,
  parsePrice,
  parseConversionType,
  parseConversionManufacturer,
  parseCard,
  hashPage1Entries,
  isNavigationTimeout,
} from './blvd.js'
import type { RawCard } from './blvd.js'

// ─── parseMileage ────────────────────────────────────────────────────────────

describe('parseMileage', () => {
  it('parses comma-formatted mileage', () => {
    expect(parseMileage('50,094')).toBe(50094)
    expect(parseMileage('1,234,567')).toBe(1234567)
  })

  it('parses mileage without commas', () => {
    expect(parseMileage('12000')).toBe(12000)
  })

  it('returns null for empty or non-numeric input', () => {
    expect(parseMileage('')).toBeNull()
    expect(parseMileage('N/A')).toBeNull()
    expect(parseMileage('Call')).toBeNull()
  })
})

// ─── parsePrice ──────────────────────────────────────────────────────────────

describe('parsePrice', () => {
  it('converts dollar amount to cents', () => {
    expect(parsePrice('$71,991')).toBe(7199100)
    expect(parsePrice('$1,000')).toBe(100000)
  })

  it('handles price without dollar sign', () => {
    expect(parsePrice('71991')).toBe(7199100)
  })

  it('returns null for "Call" and empty strings', () => {
    expect(parsePrice('Call')).toBeNull()
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('Call for Price')).toBeNull()
  })
})

// ─── parseConversionType ─────────────────────────────────────────────────────

describe('parseConversionType', () => {
  it('detects rear entry', () => {
    expect(parseConversionType('Rear Entry Wheelchair Van Conversion')).toBe('rear_entry')
    expect(parseConversionType('VMI Rear-Entry Northstar')).toBe('rear_entry')
    expect(parseConversionType('rear entry van')).toBe('rear_entry')
  })

  it('detects side entry', () => {
    expect(parseConversionType('Side Entry Conversion')).toBe('side_entry')
    expect(parseConversionType('BraunAbility Side-Entry')).toBe('side_entry')
  })

  it('returns unknown when entry type is not mentioned', () => {
    expect(parseConversionType('Driverge Flex Maxx Wheelchair Van Conversion')).toBe('unknown')
    expect(parseConversionType('')).toBe('unknown')
  })
})

// ─── parseConversionManufacturer ─────────────────────────────────────────────

describe('parseConversionManufacturer', () => {
  it('extracts the first word as the manufacturer', () => {
    expect(parseConversionManufacturer('Driverge Driverge Flex Maxx Wheelchair Van Conversion')).toBe('Driverge')
    expect(parseConversionManufacturer('BraunAbility Side Entry')).toBe('BraunAbility')
    expect(parseConversionManufacturer('VMI Northstar')).toBe('VMI')
  })

  it('strips the "Wheelchair Van Conversion" suffix before extracting', () => {
    expect(parseConversionManufacturer('Rollx Wheelchair Van Conversion')).toBe('Rollx')
  })

  it('returns null for empty input', () => {
    expect(parseConversionManufacturer('')).toBeNull()
  })
})

// ─── parseCard ───────────────────────────────────────────────────────────────

const validCard: RawCard = {
  href: '/wheelchair-vans/mobilityworks-north-las-vegas-nv/5TDYRKEC8RS205440',
  fullTitle: '2024 Toyota Sienna FWD XLE',
  conversion: 'Driverge Driverge Flex Maxx Wheelchair Van Conversion',
  condition: 'Used',
  miles: '50,094',
  price: '$71,991',
  seller: 'MobilityWorks',
  location: 'North Las Vegas, NV',
  imageUrl: 'https://www.blvd.com/wheelchair-vans-dir/mobilityworks/5TDYRKEC8RS205440_89032_1_thumb.jpg',
  dataId: '159531',
}

describe('parseCard', () => {
  it('parses a complete valid card', () => {
    const result = parseCard(validCard)
    expect(result).not.toBeNull()
    expect(result!.make).toBe('Toyota')
    expect(result!.model).toBe('Sienna')
    expect(result!.year).toBe(2024)
    expect(result!.trim).toBe('FWD XLE')
    expect(result!.vin).toBe('5TDYRKEC8RS205440')
    expect(result!.condition).toBe('used')
    expect(result!.mileage).toBe(50094)
    expect(result!.priceCents).toBe(7199100)
    expect(result!.dealer.name).toBe('MobilityWorks')
    expect(result!.location.city).toBe('North Las Vegas')
    expect(result!.location.state).toBe('NV')
    expect(result!.sourceId).toBe('blvd')
    expect(result!.sourceUrl).toContain('5TDYRKEC8RS205440')
    expect(result!.buyerUrl).toBe(result!.sourceUrl)
    expect(result!.sellerType).toBe('dealer')
  })

  it('classifies BLVD for-sale-by-owner listings as private seller inventory', () => {
    const result = parseCard({ ...validCard, seller: 'For Sale By Owner' })

    expect(result).not.toBeNull()
    expect(result!.sellerType).toBe('private')
    expect(result!.dealer.name).toBe('For Sale By Owner')
    expect(result!.buyerUrl).toBe(result!.sourceUrl)
  })

  it('sets condition to "new" when vehicle condition is New', () => {
    const result = parseCard({ ...validCard, condition: 'New' })
    expect(result!.condition).toBe('new')
  })

  it('returns null when VIN is not 17 characters', () => {
    expect(parseCard({ ...validCard, href: '/wheelchair-vans/dealer/TOOSHORT' })).toBeNull()
    expect(parseCard({ ...validCard, href: '/wheelchair-vans/dealer/' })).toBeNull()
  })

  it('returns null when make or model cannot be parsed', () => {
    expect(parseCard({ ...validCard, fullTitle: '' })).toBeNull()
    expect(parseCard({ ...validCard, fullTitle: '2024' })).toBeNull()
  })

  it('returns null for implausible years', () => {
    expect(parseCard({ ...validCard, fullTitle: '1985 Toyota Sienna FWD XLE' })).toBeNull()
    expect(parseCard({ ...validCard, fullTitle: '2099 Toyota Sienna FWD XLE' })).toBeNull()
  })

  it('handles "Call" price gracefully', () => {
    const result = parseCard({ ...validCard, price: 'Call' })
    expect(result).not.toBeNull()
    expect(result!.priceCents).toBeNull()
  })

  it('handles missing mileage gracefully', () => {
    const result = parseCard({ ...validCard, miles: '' })
    expect(result).not.toBeNull()
    expect(result!.mileage).toBeNull()
  })

  it('includes the thumbnail image', () => {
    const result = parseCard(validCard)
    expect(result!.images).toHaveLength(1)
    expect(result!.images[0]).toContain('5TDYRKEC8RS205440')
  })

  it('sets externalId from data-id attribute', () => {
    const result = parseCard(validCard)
    expect(result!.externalId).toBe('159531')
  })

  it('sets sourceRecordKey to externalId when data-id is present', () => {
    const result = parseCard(validCard)
    expect(result!.sourceRecordKey).toBe('159531')
  })

  it('falls back to normalized sourceUrl for sourceRecordKey when data-id is absent', () => {
    const result = parseCard({ ...validCard, dataId: '' })
    expect(result!.externalId).toBeNull()
    expect(result!.sourceRecordKey).toBe(result!.sourceUrl)
  })
})

describe('hashPage1Entries', () => {
  it('changes when FSBO page 1 entries change but dealer entries do not', () => {
    const dealerEntries = ['/wheelchair-vans-for-sale:dealer-1:$71,991']
    const previousHash = hashPage1Entries(dealerEntries)
    const currentHash = hashPage1Entries([
      ...dealerEntries,
      '/wheelchair-vans-for-sale-by-owner:fsbo-1:$55,000',
    ])

    expect(currentHash).not.toBe(previousHash)
  })

  it('keeps entries from different BLVD paths distinct when ids and prices match', () => {
    const dealerHash = hashPage1Entries(['/wheelchair-vans-for-sale:159531:$71,991'])
    const fsboHash = hashPage1Entries(['/wheelchair-vans-for-sale-by-owner:159531:$71,991'])

    expect(fsboHash).not.toBe(dealerHash)
  })
})

describe('isNavigationTimeout', () => {
  it('detects Playwright navigation timeout errors', () => {
    expect(isNavigationTimeout(new Error('page.goto: Timeout 30000ms exceeded.'))).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isNavigationTimeout(new Error('net::ERR_ABORTED'))).toBe(false)
    expect(isNavigationTimeout('Timeout 30000ms exceeded')).toBe(false)
  })
})
