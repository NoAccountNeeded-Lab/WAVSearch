import { describe, it, expect } from 'vitest'
import {
  parseMwRampType,
  parseMwFloorLowering,
  parseMwZip,
  parseMwDetail,
} from './mobilityworks-detail.js'
import type { RawMwDetail } from './mobilityworks-detail.js'

// ─── parseMwRampType ──────────────────────────────────────────────────────────

describe('parseMwRampType', () => {
  it('detects in-floor ramp', () => {
    expect(parseMwRampType('In-Floor ramp conversion')).toBe('in_floor')
    expect(parseMwRampType('infloor automatic')).toBe('in_floor')
    expect(parseMwRampType('in floor ramp fully operational')).toBe('in_floor')
  })

  it('detects fold-out ramp', () => {
    expect(parseMwRampType('Rear Entry Manual Fold Out')).toBe('fold_out')
    expect(parseMwRampType('fold-out ramp')).toBe('fold_out')
  })

  it('detects fold-in ramp', () => {
    expect(parseMwRampType('Fold In ramp included')).toBe('fold_in')
    expect(parseMwRampType('fold-in ramp')).toBe('fold_in')
  })

  it('returns unknown when no ramp type can be determined', () => {
    expect(parseMwRampType('Wheelchair accessible van')).toBe('unknown')
    expect(parseMwRampType('')).toBe('unknown')
  })
})

// ─── parseMwFloorLowering ─────────────────────────────────────────────────────

describe('parseMwFloorLowering', () => {
  it('parses floor lowering in various formats', () => {
    expect(parseMwFloorLowering('14 inch floor lowering')).toBe(14)
    expect(parseMwFloorLowering('6 in. floor drop')).toBe(6)
    expect(parseMwFloorLowering('floor lowering of 10 inches')).toBe(10)
  })

  it('returns null when not mentioned', () => {
    expect(parseMwFloorLowering('Fold Out ramp conversion')).toBeNull()
    expect(parseMwFloorLowering('')).toBeNull()
  })
})

// ─── parseMwZip ───────────────────────────────────────────────────────────────

describe('parseMwZip', () => {
  it('extracts a 5-digit zip from an address string', () => {
    expect(parseMwZip('1234 Main St, Atlanta, GA 30301')).toBe('30301')
  })

  it('returns null when no zip is present', () => {
    expect(parseMwZip('Atlanta, GA')).toBeNull()
    expect(parseMwZip('')).toBeNull()
  })
})

// ─── parseMwDetail ────────────────────────────────────────────────────────────

const baseRaw: RawMwDetail = {
  specs: {
    'Exterior Color': 'Silver',
    Engine: '3.5L V6',
    Transmission: 'Automatic',
  },
  descriptionText: 'Rear Entry Manual Fold Out ramp. 14 inch floor lowering. Hand controls installed.',
  imageUrls: [
    'https://www.mobilityworks.com/images/van1.jpg',
    'https://www.mobilityworks.com/images/van2.jpg',
  ],
  dealerPhone: '(404) 555-1234',
  dealerAddressText: '1234 Main St Atlanta GA 30301',
  statusBannerText: '',
}

describe('parseMwDetail', () => {
  it('extracts color, fuelType, and transmission from specs', () => {
    const result = parseMwDetail(baseRaw)
    expect(result.color).toBe('Silver')
    expect(result.fuelType).toBe('3.5L V6')
    expect(result.transmission).toBe('Automatic')
  })

  it('parses ramp type from description text', () => {
    expect(parseMwDetail(baseRaw).rampType).toBe('fold_out')
  })

  it('parses floor lowering from description text', () => {
    expect(parseMwDetail(baseRaw).floorLoweringInches).toBe(14)
  })

  it('detects hand controls from description', () => {
    expect(parseMwDetail(baseRaw).handControls).toBe(true)
  })

  it('detects hasLift when description mentions a lift', () => {
    const withLift = { ...baseRaw, descriptionText: 'Power lift included' }
    expect(parseMwDetail(withLift).hasLift).toBe(true)

    const withoutLift = { ...baseRaw, descriptionText: 'Fold Out ramp' }
    expect(parseMwDetail(withoutLift).hasLift).toBe(false)
  })

  it('passes through all image URLs', () => {
    const result = parseMwDetail(baseRaw)
    expect(result.images).toHaveLength(2)
  })

  it('extracts zip from dealer address', () => {
    expect(parseMwDetail(baseRaw).zip).toBe('30301')
  })

  it('passes through dealer phone', () => {
    expect(parseMwDetail(baseRaw).dealerPhone).toBe('(404) 555-1234')
  })

  it('returns active saleStatus when no banner is present', () => {
    expect(parseMwDetail(baseRaw).saleStatus).toBe('active')
  })

  it('returns sold saleStatus when banner says Sold', () => {
    const sold = { ...baseRaw, statusBannerText: 'Sold' }
    expect(parseMwDetail(sold).saleStatus).toBe('sold')
  })

  it('returns pending saleStatus when banner says Pending Sale', () => {
    const pending = { ...baseRaw, statusBannerText: 'Pending Sale' }
    expect(parseMwDetail(pending).saleStatus).toBe('pending')
  })

  it('falls back to Color spec when Exterior Color is absent', () => {
    const noExtColor = { ...baseRaw, specs: { Color: 'Blue', Engine: '2.0L I4', Transmission: 'CVT' } }
    expect(parseMwDetail(noExtColor).color).toBe('Blue')
  })

  it('returns null for optional fields when not present in specs', () => {
    const sparse: RawMwDetail = {
      specs: {},
      descriptionText: '',
      imageUrls: [],
      dealerPhone: '',
      dealerAddressText: '',
      statusBannerText: '',
    }
    const result = parseMwDetail(sparse)
    expect(result.color).toBeNull()
    expect(result.fuelType).toBeNull()
    expect(result.transmission).toBeNull()
    expect(result.zip).toBeNull()
    expect(result.dealerPhone).toBeNull()
    expect(result.description).toBeNull()
  })
})
