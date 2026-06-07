import { describe, it, expect, vi } from 'vitest'
import { PrismaListingRepository } from './prisma-repositories.js'
import type { ListingUpsertData } from '../engine/repositories.js'

function makeListing(overrides: Partial<ListingUpsertData> = {}): ListingUpsertData {
  return {
    sourceId: 'src-1',
    sourceUrl: 'http://example.com/1',
    buyerUrl: 'http://example.com/1',
    externalId: 'ext-1',
    sourceRecordKey: 'ext-1',
    make: 'Toyota',
    model: 'Sienna',
    year: 2022,
    trim: null,
    vin: null,
    condition: 'used',
    sellerType: 'dealer',
    priceCents: 3000000,
    mileage: null,
    color: null,
    fuelType: null,
    transmission: null,
    wav: {
      conversionType: 'unknown',
      conversionManufacturer: null,
      floorLoweringInches: null,
      rampType: 'unknown',
      hasLift: false,
      handControls: false,
      transferSeat: false,
      wheelchairCapacity: null,
    },
    location: { zip: null, city: null, state: null, lat: null, lng: null },
    dealer: { name: null, phone: null, website: null },
    images: [],
    description: null,
    saleStatus: 'active',
    soldAt: null,
    listedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function makeDb(
  existingListing: {
    id: string
    sourceUrl?: string | null
    buyerUrl?: string | null
    sellerType?: 'dealer' | 'private'
    priceCents: number | null
    status?: string
  } | null = null,
) {
  const existing = existingListing
    ? {
        sourceUrl: 'http://example.com/1',
        buyerUrl: 'http://example.com/1',
        sellerType: 'dealer' as const,
        status: 'active',
        ...existingListing,
      }
    : null

  return {
    listing: {
      findUnique: vi.fn().mockResolvedValue(existing),
      upsert: vi.fn().mockResolvedValue({}),
    },
    listingPriceHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('PrismaListingRepository', () => {
  describe('upsert price history', () => {
    it('writes a history row when price changes on re-scrape', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 2500000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listingPriceHistory.create).toHaveBeenCalledWith({
        data: { listingId: 'list-1', priceCents: 3000000 },
      })
    })

    it('does not write a history row when price is unchanged', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listingPriceHistory.create).not.toHaveBeenCalled()
    })

    it('does not write a history row for a new listing (create path)', async () => {
      const db = makeDb(null)
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      // priceHistory nested create handles the initial row via the upsert create branch
      expect(db.listingPriceHistory.create).not.toHaveBeenCalled()
    })

    it('does not write a history row when new price is null', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: null }))

      expect(db.listingPriceHistory.create).not.toHaveBeenCalled()
    })
  })

  describe('upsert skip for unchanged listings', () => {
    it('skips the DB write when listing exists with same price', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).not.toHaveBeenCalled()
    })

    it('skips the DB write when listing exists with null price and scraped price is also null', async () => {
      const db = makeDb({ id: 'list-1', priceCents: null })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: null }))

      expect(db.listing.upsert).not.toHaveBeenCalled()
    })

    it('writes the DB when listing exists and price changed', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 2500000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalled()
    })

    it('writes the DB when buyer URL metadata changed', async () => {
      const db = makeDb({ id: 'list-1', buyerUrl: null, priceCents: 3000000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.not.objectContaining({ detailScrapedAt: null }),
      }))
    })

    it('writes the DB and updates sourceUrl when the listing slug changes on re-scrape', async () => {
      const db = makeDb({ id: 'list-1', sourceUrl: 'http://example.com/old-slug', priceCents: 3000000 })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000, sourceUrl: 'http://example.com/new-slug' }))

      expect(db.listing.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ sourceUrl: 'http://example.com/new-slug' }),
      }))
    })

    it('writes the DB for a new listing', async () => {
      const db = makeDb(null)
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalled()
    })

    it('writes the DB when listing was possibly_gone and reappears (same price)', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000, status: 'possibly_gone' })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalled()
    })

    it('writes the DB when listing was gone and reappears (same price)', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000, status: 'gone' })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalled()
    })
  })

  describe('upsert detailScrapedAt reset', () => {
    it('resets detailScrapedAt when price changes', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 2500000, status: 'active' })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ detailScrapedAt: null }),
      }))
    })

    it('resets detailScrapedAt when a possibly_gone listing reappears', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000, status: 'possibly_gone' })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ detailScrapedAt: null }),
      }))
    })

    it('resets detailScrapedAt when a gone listing reappears', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 3000000, status: 'gone' })
      const repo = new PrismaListingRepository(db as never)
      await repo.upsert(makeListing({ priceCents: 3000000 }))

      expect(db.listing.upsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ detailScrapedAt: null }),
      }))
    })

    it('does not reset detailScrapedAt when price and status are unchanged', async () => {
      const db = makeDb({ id: 'list-1', priceCents: 2500000, status: 'active' })
      const repo = new PrismaListingRepository(db as never)
      // same price → early return, no upsert at all
      await repo.upsert(makeListing({ priceCents: 2500000 }))

      expect(db.listing.upsert).not.toHaveBeenCalled()
    })
  })
})
