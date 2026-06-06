import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@wav-search/db', () => ({ getDb: vi.fn() }))

import { acquireListingLock, releaseListingLock, releaseListingLocks, unlockableWhere, LOCK_TTL_MS } from './listing-lock.js'
import { getDb } from '@wav-search/db'

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    $executeRaw: vi.fn(),
    listing: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  }
}

describe('acquireListingLock', () => {
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
    vi.mocked(getDb).mockReturnValue(db as never)
  })

  it('returns true when executeRaw affects 1 row (lock acquired)', async () => {
    db.$executeRaw.mockResolvedValue(1)
    const result = await acquireListingLock(db as never, 'listing-1')
    expect(result).toBe(true)
  })

  it('returns false when executeRaw affects 0 rows (already locked)', async () => {
    db.$executeRaw.mockResolvedValue(0)
    const result = await acquireListingLock(db as never, 'listing-1')
    expect(result).toBe(false)
  })

  it('passes the listing id and both timestamps to the raw SQL', async () => {
    db.$executeRaw.mockResolvedValue(1)
    const before = Date.now()
    await acquireListingLock(db as never, 'my-listing-id')
    const after = Date.now()

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    // The tagged template literal is called with the template strings array + interpolated values
    const call = db.$executeRaw.mock.calls[0]
    const args = call?.slice(1) as Date[]
    // First interpolated arg = now (the new lock timestamp)
    expect(args[0]).toBeInstanceOf(Date)
    expect(args[0]!.getTime()).toBeGreaterThanOrEqual(before)
    expect(args[0]!.getTime()).toBeLessThanOrEqual(after)
    // Second interpolated arg = listingId
    expect(args[1]).toBe('my-listing-id')
    // Third interpolated arg = staleThreshold (now - LOCK_TTL_MS)
    expect(args[2]).toBeInstanceOf(Date)
    expect(args[2]!.getTime()).toBeLessThan(args[0]!.getTime())
    expect(args[0]!.getTime() - args[2]!.getTime()).toBeCloseTo(LOCK_TTL_MS, -2)
  })
})

describe('releaseListingLock', () => {
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
  })

  it('updates the listing with processingLockedAt: null', async () => {
    await releaseListingLock(db as never, 'listing-abc')
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-abc' },
      data: { processingLockedAt: null },
    })
  })
})

describe('releaseListingLocks', () => {
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
  })

  it('does nothing for an empty id list', async () => {
    await releaseListingLocks(db as never, [])
    expect(db.listing.updateMany).not.toHaveBeenCalled()
  })

  it('calls updateMany with all ids for a non-empty list', async () => {
    await releaseListingLocks(db as never, ['id-1', 'id-2', 'id-3'])
    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-1', 'id-2', 'id-3'] } },
      data: { processingLockedAt: null },
    })
  })
})

describe('unlockableWhere', () => {
  it('returns an OR filter with null and a stale threshold', () => {
    const before = Date.now()
    const filter = unlockableWhere()
    const after = Date.now()

    expect(filter).toHaveProperty('OR')
    expect(filter.OR).toHaveLength(2)

    // First branch: match rows with no lock at all
    expect(filter.OR[0]).toEqual({ processingLockedAt: null })

    // Second branch: match rows with a stale lock
    expect(filter.OR[1]).toHaveProperty('processingLockedAt.lt')
    const threshold = (filter.OR[1] as { processingLockedAt: { lt: Date } }).processingLockedAt.lt
    expect(threshold).toBeInstanceOf(Date)
    // staleThreshold should be LOCK_TTL_MS before "now"
    expect(before - threshold.getTime()).toBeCloseTo(LOCK_TTL_MS, -2)
    expect(after - threshold.getTime()).toBeGreaterThanOrEqual(LOCK_TTL_MS)
  })
})
