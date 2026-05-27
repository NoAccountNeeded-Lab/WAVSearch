import { describe, it, expect, vi } from 'vitest'
import { PrismaListingRepository } from './prisma-repositories.js'
import type { ListingUpsertData } from '../engine/repositories.js'

function makeListing(overrides: Partial<ListingUpsertData> = {}): ListingUpsertData {
  return {
    sourceId: 'src-1',
    sourceUrl: 'http://example.com/1',
    externalId: 'ext-1',
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
    listedAt: new Date('2024-01-01'),
    ...overrides,
  }
}

function makeDb(existingListing: { id: string; priceCents: number | null } | null = null) {
  return {
    listing: {
      findUnique: vi.fn().mockResolvedValue(existingListing),
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
})
