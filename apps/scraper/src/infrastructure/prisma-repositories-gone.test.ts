import { describe, it, expect, vi } from 'vitest'
import { PrismaListingRepository } from './prisma-repositories.js'

function makeDb(updateManyCount = 0) {
  return {
    listing: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
    },
    listingPriceHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('PrismaListingRepository.markGone', () => {
  it('soft-marks active listings absent from the scraped set as possibly_gone', async () => {
    const db = makeDb(3)
    const repo = new PrismaListingRepository(db as never)

    const count = await repo.markGone('src-1', ['key-1', 'key-2'])

    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { sourceId: 'src-1', status: 'active', sourceRecordKey: { notIn: ['key-1', 'key-2'] } },
      data: { status: 'possibly_gone', detailScrapedAt: null },
    })
    expect(count).toBe(3)
  })

  it('returns 0 and does nothing when activeSourceRecordKeys is empty', async () => {
    const db = makeDb(0)
    const repo = new PrismaListingRepository(db as never)

    const count = await repo.markGone('src-1', [])

    expect(db.listing.updateMany).not.toHaveBeenCalled()
    expect(count).toBe(0)
  })

  it('returns 0 when all listings are still present', async () => {
    const db = makeDb(0)
    const repo = new PrismaListingRepository(db as never)

    const count = await repo.markGone('src-1', ['key-1', 'key-2', 'key-3'])

    expect(count).toBe(0)
  })
})
