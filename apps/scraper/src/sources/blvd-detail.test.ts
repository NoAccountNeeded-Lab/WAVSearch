import { describe, it, expect } from 'vitest'
import {
  parseRampType,
  parseFloorLowering,
  parseZip,
  parseSaleStatus,
  parseBlvdDetail,
} from './blvd-detail.js'
import type { RawDetail } from './blvd-detail.js'

// ─── parseSaleStatus ──────────────────────────────────────────────────────────

describe('parseSaleStatus', () => {
  it('returns sold for "Sold" banner text', () => {
    expect(parseSaleStatus('Sold')).toBe('sold')
    expect(parseSaleStatus('SOLD')).toBe('sold')
  })

  it('returns sold for "No Longer Available" text', () => {
    expect(parseSaleStatus('No Longer Available')).toBe('sold')
    expect(parseSaleStatus('Vehicle Unavailable')).toBe('sold')
  })

  it('returns pending for "Pending Sale" banner text', () => {
    expect(parseSaleStatus('Pending Sale')).toBe('pending')
    expect(parseSaleStatus('PENDING')).toBe('pending')
    expect(parseSaleStatus('Under Contract')).toBe('pending')
  })

  it('returns active when no banner text is present', () => {
    expect(parseSaleStatus('')).toBe('active')
    expect(parseSaleStatus('View Details')).toBe('active')
  })
})

// ─── parseRampType ────────────────────────────────────────────────────────────

describe('parseRampType', () => {
  it('detects in-floor ramp', () => {
    expect(parseRampType('In-Floor Ramp is fully operational')).toBe('in_floor')
    expect(parseRampType('in floor ramp fully operational')).toBe('in_floor')
    expect(parseRampType('Manual In-Floor Ramp')).toBe('in_floor')
  })

  it('detects fold-out ramp', () => {
    expect(parseRampType('Rear Entry, Manual, Fold Out ramp or lift is fully operational')).toBe('fold_out')
    expect(parseRampType('fold-out ramp')).toBe('fold_out')
    expect(parseRampType('Fold Out Ramp')).toBe('fold_out')
  })

  it('detects fold-in ramp', () => {
    expect(parseRampType('Fold In ramp included')).toBe('fold_in')
    expect(parseRampType('fold-in ramp')).toBe('fold_in')
  })

  it('returns unknown when no ramp type can be determined', () => {
    expect(parseRampType('Beautiful wheelchair van conversion')).toBe('unknown')
    expect(parseRampType('')).toBe('unknown')
  })
})

// ─── parseFloorLowering ───────────────────────────────────────────────────────

describe('parseFloorLowering', () => {
  it('parses floor lowering with inch notation', () => {
    expect(parseFloorLowering('14 inch floor lowering')).toBe(14)
    expect(parseFloorLowering('14" floor lowering')).toBe(14)
    expect(parseFloorLowering('6 in. floor drop')).toBe(6)
  })

  it('parses floor lowering stated in reverse order', () => {
    expect(parseFloorLowering('floor lowering of 14 inches')).toBe(14)
    expect(parseFloorLowering('floor lowered 10 inches')).toBe(10)
  })

  it('returns null when no floor lowering is mentioned', () => {
    expect(parseFloorLowering('Fold Out ramp is fully operational')).toBeNull()
    expect(parseFloorLowering('')).toBeNull()
  })
})

// ─── parseZip ─────────────────────────────────────────────────────────────────

describe('parseZip', () => {
  it('extracts a 5-digit zip from an address string', () => {
    expect(parseZip('3575 W Cheyenne Ave\nNorth Las Vegas, NV 89032')).toBe('89032')
    expect(parseZip('Seattle, WA 98101')).toBe('98101')
  })

  it('returns null when no zip is found', () => {
    expect(parseZip('North Las Vegas, NV')).toBeNull()
    expect(parseZip('')).toBeNull()
  })
})

// ─── parseBlvdDetail ─────────────────────────────────────────────────────────

const baseRaw: RawDetail = {
  specs: {
    Color: 'Grey',
    'Interior Color': 'Black',
    Engine: '2.5L Hybrid I4 245hp',
    Transmission: 'automatic',
  },
  descriptionText: 'Rear Entry, Manual, Fold Out ramp or lift is fully operational. 14 inch floor lowering.',
  imageUrls: [
    'https://www.blvd.com/wheelchair-vans-dir/mobilityworks/5TDYRKEC8RS205440_89032_1_large.jpg',
    'https://www.blvd.com/wheelchair-vans-dir/mobilityworks/5TDYRKEC8RS205440_89032_2_large.jpg',
  ],
  dealerPhone: '(725) 220-6660',
  dealerAddressText: '3575 W Cheyenne Ave\nNorth Las Vegas, NV 89032',
  statusBannerText: '',
}

describe('parseBlvdDetail', () => {
  it('extracts color, fuelType, and transmission from specs', () => {
    const result = parseBlvdDetail(baseRaw)
    expect(result.color).toBe('Grey')
    expect(result.fuelType).toBe('2.5L Hybrid I4 245hp')
    expect(result.transmission).toBe('automatic')
  })

  it('parses ramp type from description text', () => {
    const result = parseBlvdDetail(baseRaw)
    expect(result.rampType).toBe('fold_out')
  })

  it('parses floor lowering from description text', () => {
    const result = parseBlvdDetail(baseRaw)
    expect(result.floorLoweringInches).toBe(14)
  })

  it('detects hasLift when description mentions a lift', () => {
    const withLift = { ...baseRaw, descriptionText: 'Power lift included' }
    expect(parseBlvdDetail(withLift).hasLift).toBe(true)

    const withoutLift = { ...baseRaw, descriptionText: 'Fold Out ramp' }
    expect(parseBlvdDetail(withoutLift).hasLift).toBe(false)
  })

  it('detects hand controls from description text', () => {
    const withControls = { ...baseRaw, descriptionText: 'Hand controls installed' }
    expect(parseBlvdDetail(withControls).handControls).toBe(true)

    expect(parseBlvdDetail(baseRaw).handControls).toBe(false)
  })

  it('detects transfer seat from description text', () => {
    const withSeat = { ...baseRaw, descriptionText: 'Transfer seat included' }
    expect(parseBlvdDetail(withSeat).transferSeat).toBe(true)

    expect(parseBlvdDetail(baseRaw).transferSeat).toBe(false)
  })

  it('passes through all image URLs', () => {
    const result = parseBlvdDetail(baseRaw)
    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toContain('_1_large.jpg')
  })

  it('extracts zip from dealer address', () => {
    expect(parseBlvdDetail(baseRaw).zip).toBe('89032')
  })

  it('passes through dealer phone', () => {
    expect(parseBlvdDetail(baseRaw).dealerPhone).toBe('(725) 220-6660')
  })

  it('stores description text', () => {
    expect(parseBlvdDetail(baseRaw).description).toBe(baseRaw.descriptionText)
  })

  it('returns active saleStatus when no banner is present', () => {
    expect(parseBlvdDetail(baseRaw).saleStatus).toBe('active')
  })

  it('returns sold saleStatus when banner says Sold', () => {
    const sold = { ...baseRaw, statusBannerText: 'Sold' }
    expect(parseBlvdDetail(sold).saleStatus).toBe('sold')
  })

  it('returns pending saleStatus when banner says Pending Sale', () => {
    const pending = { ...baseRaw, statusBannerText: 'Pending Sale' }
    expect(parseBlvdDetail(pending).saleStatus).toBe('pending')
  })

  it('returns null for optional fields when not present in specs', () => {
    const sparse: RawDetail = {
      specs: {},
      descriptionText: '',
      imageUrls: [],
      dealerPhone: '',
      dealerAddressText: '',
      statusBannerText: '',
    }
    const result = parseBlvdDetail(sparse)
    expect(result.color).toBeNull()
    expect(result.fuelType).toBeNull()
    expect(result.transmission).toBeNull()
    expect(result.zip).toBeNull()
    expect(result.dealerPhone).toBeNull()
    expect(result.description).toBeNull()
  })
})
