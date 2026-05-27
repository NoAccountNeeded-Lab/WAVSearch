import { describe, it, expect } from 'vitest'
import {
  parseMileage,
  parsePrice,
  parseConversionType,
  parseRampType,
  parseLocation,
  parseCard,
} from './mobilityworks.js'
import type { RawCard } from './mobilityworks.js'

// ─── parseMileage ────────────────────────────────────────────────────────────

describe('parseMileage', () => {
  it('parses numeric mileage without commas', () => {
    expect(parseMileage('50094')).toBe(50094)
    expect(parseMileage('1234')).toBe(1234)
  })

  it('parses comma-formatted mileage', () => {
    expect(parseMileage('50,094')).toBe(50094)
  })

  it('returns null for empty or non-numeric input', () => {
    expect(parseMileage('')).toBeNull()
    expect(parseMileage('N/A')).toBeNull()
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

  it('returns null for "Call for Price" and empty strings', () => {
    expect(parsePrice('Call for Price')).toBeNull()
    expect(parsePrice('')).toBeNull()
  })
})

// ─── parseConversionType ─────────────────────────────────────────────────────

describe('parseConversionType', () => {
  it('detects rear entry', () => {
    expect(parseConversionType('Rear Entry Manual Fold Out')).toBe('rear_entry')
    expect(parseConversionType('rear-entry conversion')).toBe('rear_entry')
  })

  it('detects side entry', () => {
    expect(parseConversionType('Side Entry In-Floor')).toBe('side_entry')
    expect(parseConversionType('side-entry van')).toBe('side_entry')
  })

  it('returns unknown for unrecognized text', () => {
    expect(parseConversionType('')).toBe('unknown')
    expect(parseConversionType('Wheelchair Van Conversion')).toBe('unknown')
  })
})

// ─── parseRampType ───────────────────────────────────────────────────────────

describe('parseRampType', () => {
  it('detects fold out ramp', () => {
    expect(parseRampType('Rear Entry Manual Fold Out')).toBe('fold_out')
    expect(parseRampType('fold-out ramp')).toBe('fold_out')
  })

  it('detects in-floor ramp', () => {
    expect(parseRampType('Rear Entry In-Floor')).toBe('in_floor')
    expect(parseRampType('Side Entry In Floor Ramp')).toBe('in_floor')
    expect(parseRampType('Infloor conversion')).toBe('in_floor')
  })

  it('detects fold-in ramp', () => {
    expect(parseRampType('Fold In Ramp')).toBe('fold_in')
    expect(parseRampType('fold-in conversion')).toBe('fold_in')
  })

  it('returns unknown for unrecognized text', () => {
    expect(parseRampType('')).toBe('unknown')
    expect(parseRampType('Manual Ramp')).toBe('unknown')
  })
})

// ─── parseLocation ───────────────────────────────────────────────────────────

describe('parseLocation', () => {
  it('parses multi-word city and two-letter state code', () => {
    const result = parseLocation('North Las Vegas NV')
    expect(result.city).toBe('North Las Vegas')
    expect(result.state).toBe('NV')
  })

  it('parses single-word city', () => {
    const result = parseLocation('Columbus OH')
    expect(result.city).toBe('Columbus')
    expect(result.state).toBe('OH')
  })

  it('returns city and null state when no state code found', () => {
    const result = parseLocation('North Las Vegas')
    expect(result.city).toBe('North Las Vegas')
    expect(result.state).toBeNull()
  })

  it('returns null city for empty string', () => {
    const result = parseLocation('')
    expect(result.city).toBeNull()
    expect(result.state).toBeNull()
  })
})

// ─── parseCard ───────────────────────────────────────────────────────────────

const validCard: RawCard = {
  href: '/wheelchair-vans-for-sale/2024-toyota-sienna-driverge-5tdyrkec8rs205440/',
  title: 'Used 2024 Toyota Sienna FWD XLE (New Conversion)',
  price: '$71,991',
  stock: 'RS205440',
  mileage: '50094',
  color: 'Grey',
  convMake: 'Driverge',
  conversion: 'Rear Entry Manual Fold Out',
  location: 'North Las Vegas NV',
  imageUrl: 'https://s3.amazonaws.com/vehicle-images/abc123.jpg',
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
    expect(result!.color).toBe('Grey')
    expect(result!.location.city).toBe('North Las Vegas')
    expect(result!.location.state).toBe('NV')
    expect(result!.wav.conversionType).toBe('rear_entry')
    expect(result!.wav.conversionManufacturer).toBe('Driverge')
    expect(result!.wav.rampType).toBe('fold_out')
    expect(result!.sourceId).toBe('mobilityworks')
    expect(result!.sourceUrl).toContain('5tdyrkec8rs205440')
    expect(result!.externalId).toBe('RS205440')
  })

  it('sets condition to "new" for new vehicles', () => {
    const result = parseCard({ ...validCard, title: 'New 2024 Toyota Sienna FWD XLE' })
    expect(result!.condition).toBe('new')
  })

  it('strips trailing parenthetical from title before parsing', () => {
    const result = parseCard({ ...validCard, title: 'Used 2024 Toyota Sienna FWD XLE (New Conversion)' })
    expect(result!.trim).toBe('FWD XLE')
  })

  it('returns null when VIN is not 17 alphanumeric chars', () => {
    expect(parseCard({ ...validCard, href: '/wheelchair-vans-for-sale/2024-toyota-sienna-TOOSHORT/' })).toBeNull()
    expect(parseCard({ ...validCard, href: '/wheelchair-vans-for-sale/' })).toBeNull()
  })

  it('returns null when make or model cannot be parsed', () => {
    expect(parseCard({ ...validCard, title: '' })).toBeNull()
    expect(parseCard({ ...validCard, title: 'Used 2024' })).toBeNull()
  })

  it('returns null for implausible years', () => {
    expect(parseCard({ ...validCard, title: 'Used 1985 Toyota Sienna FWD XLE' })).toBeNull()
    expect(parseCard({ ...validCard, title: 'Used 2099 Toyota Sienna FWD XLE' })).toBeNull()
  })

  it('handles "Call for Price" gracefully', () => {
    const result = parseCard({ ...validCard, price: 'Call for Price' })
    expect(result).not.toBeNull()
    expect(result!.priceCents).toBeNull()
  })

  it('handles missing mileage gracefully', () => {
    const result = parseCard({ ...validCard, mileage: '' })
    expect(result).not.toBeNull()
    expect(result!.mileage).toBeNull()
  })

  it('includes the thumbnail image', () => {
    const result = parseCard(validCard)
    expect(result!.images).toHaveLength(1)
    expect(result!.images[0]).toContain('abc123')
  })

  it('sets externalId from stock number', () => {
    const result = parseCard(validCard)
    expect(result!.externalId).toBe('RS205440')
  })

  it('falls back to VIN as externalId when stock is empty', () => {
    const result = parseCard({ ...validCard, stock: '' })
    expect(result!.externalId).toBe('5TDYRKEC8RS205440')
  })

  it('uppercases the VIN from the URL slug', () => {
    const result = parseCard(validCard)
    expect(result!.vin).toBe('5TDYRKEC8RS205440')
  })

  it('sets dealer name to MobilityWorks', () => {
    const result = parseCard(validCard)
    expect(result!.dealer.name).toBe('MobilityWorks')
  })
})
