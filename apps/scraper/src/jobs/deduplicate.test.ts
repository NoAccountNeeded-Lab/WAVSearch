import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DB module before importing the job
vi.mock('@wav-search/db', () => ({
  getDb: vi.fn(),
}))
vi.mock('@wav-search/search', () => ({ syncListings: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/meili.js', () => ({ getMeiliClient: vi.fn() }))

import { getDb } from '@wav-search/db'
import { runDeduplicateJob } from './deduplicate.js'

function makeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'list-1',
    sourceId: 'src-1',
    sourceUrl: 'http://example.com/1',
    externalId: null,
    make: 'Toyota',
    model: 'Sienna',
    year: 2022,
    trim: null,
    vin: '1ABCDEF',
    condition: 'used',
    sellerType: 'dealer',
    priceCents: null,
    mileage: null,
    color: null,
    fuelType: null,
    transmission: null,
    conversionType: 'unknown',
    conversionManufacturer: null,
    floorLoweringInches: null,
    rampType: 'none',
    hasLift: false,
    handControls: false,
    transferSeat: false,
    wheelchairCapacity: null,
    zip: null,
    city: null,
    state: null,
    lat: null,
    lng: null,
    dealerName: null,
    dealerPhone: null,
    dealerWebsite: null,
    images: [],
    description: null,
    isDuplicate: false,
    canonicalId: null,
    listedAt: new Date(),
    updatedAt: new Date(),
    scrapedAt: new Date(),
    detailScrapedAt: null,
    ...overrides,
  }
}

describe('runDeduplicateJob', () => {
  let db: {
    $queryRaw: ReturnType<typeof vi.fn>
    listing: {
      findMany: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    $disconnect: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    db = {
      $queryRaw: vi.fn(),
      listing: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      $disconnect: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(getDb).mockReturnValue(db as never)
  })

  it('does nothing when no cross-source VIN duplicates exist', async () => {
    db.$queryRaw.mockResolvedValue([])

    await runDeduplicateJob()

    expect(db.listing.update).not.toHaveBeenCalled()
    expect(db.$disconnect).toHaveBeenCalled()
  })

  it('marks the less-complete listing as duplicate', async () => {
    const vin = '1ABCDEF'
    db.$queryRaw.mockResolvedValue([{ vin }])

    const complete = makeListing({
      id: 'list-complete',
      sourceId: 'src-1',
      vin,
      priceCents: 4500000,
      mileage: 32000,
      city: 'Austin',
      state: 'TX',
      description: 'Great WAV',
    })
    const sparse = makeListing({ id: 'list-sparse', sourceId: 'src-2', vin })

    db.listing.findMany.mockResolvedValue([sparse, complete])

    await runDeduplicateJob()

    // Canonical (complete) must be cleared
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'list-complete' },
      data: { isDuplicate: false, canonicalId: null },
    })

    // Sparse must be marked as duplicate pointing to complete
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'list-sparse' },
      data: { isDuplicate: true, canonicalId: 'list-complete' },
    })
  })

  it('selects the listing with more images as canonical when other scores tie', async () => {
    const vin = '2XYZABC'
    db.$queryRaw.mockResolvedValue([{ vin }])

    const withImages = makeListing({ id: 'list-images', sourceId: 'src-1', vin, images: ['a.jpg', 'b.jpg'] })
    const noImages = makeListing({ id: 'list-no-images', sourceId: 'src-2', vin, images: [] })

    db.listing.findMany.mockResolvedValue([noImages, withImages])

    await runDeduplicateJob()

    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'list-images' },
      data: { isDuplicate: false, canonicalId: null },
    })
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'list-no-images' },
      data: { isDuplicate: true, canonicalId: 'list-images' },
    })
  })
})
