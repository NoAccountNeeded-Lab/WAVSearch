import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@wav-search/db', () => ({ getDb: vi.fn() }))
vi.mock('@wav-search/search', () => ({ syncListings: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/meili.js', () => ({ getMeiliClient: vi.fn() }))

import { getDb } from '@wav-search/db'
import { syncListings } from '@wav-search/search'
import { runGeocodeJob } from './geocode.js'

function makeDb() {
  return {
    // acquireListingLock uses $executeRaw; default to 1 (lock acquired)
    $executeRaw: vi.fn().mockResolvedValue(1),
    listing: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
      // releaseListingLocks uses listing.updateMany (already above)
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  }
}

function mockFetchCoords(lat: string, lon: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([{ lat, lon }]),
  })
}

function mockFetchEmpty() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  })
}

function mockFetchFail() {
  global.fetch = vi.fn().mockResolvedValue({ ok: false })
}

describe('runGeocodeJob', () => {
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
    vi.mocked(getDb).mockReturnValue(db as never)
  })

  it('does nothing when no un-geocoded listings exist', async () => {
    db.listing.findMany.mockResolvedValue([])

    await runGeocodeJob()

    expect(db.listing.updateMany).not.toHaveBeenCalled()
    expect(db.$disconnect).toHaveBeenCalled()
  })

  it('geocodes a location and updates all listings sharing that city+state', async () => {
    db.listing.findMany.mockResolvedValue([
      { id: 'l1', city: 'Tampa', state: 'FL' },
      { id: 'l2', city: 'Tampa', state: 'FL' },
    ])
    mockFetchCoords('27.9506', '-82.4572')

    await runGeocodeJob()

    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1', 'l2'] } },
      data: { lat: 27.9506, lng: -82.4572 },
    })
    expect(vi.mocked(syncListings)).toHaveBeenCalledWith(
      expect.arrayContaining(['l1', 'l2']),
      db,
      undefined,
    )
  })

  it('deduplicates city+state pairs — one Nominatim call per unique location', async () => {
    db.listing.findMany.mockResolvedValue([
      { id: 'l1', city: 'Tampa', state: 'FL' },
      { id: 'l2', city: 'Tampa', state: 'FL' },
      { id: 'l3', city: 'Austin', state: 'TX' },
    ])
    mockFetchCoords('30.2672', '-97.7431')

    await runGeocodeJob()

    // Two unique pairs → two fetch calls
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not update coordinates when Nominatim returns no results', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l1', city: 'Nowhere', state: 'XX' }])
    mockFetchEmpty()

    await runGeocodeJob()

    // updateMany may still be called by releaseListingLocks, but never with lat/lng data
    expect(db.listing.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lat: expect.anything() }) }),
    )
  })

  it('does not update coordinates when Nominatim returns a non-ok response', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l1', city: 'Nowhere', state: 'XX' }])
    mockFetchFail()

    await runGeocodeJob()

    expect(db.listing.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lat: expect.anything() }) }),
    )
  })

  it('skips a location group entirely when all listings are locked', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l1', city: 'Tampa', state: 'FL' }])
    // Lock not acquired for l1
    db.$executeRaw.mockResolvedValue(0)
    mockFetchCoords('27.9506', '-82.4572')

    await runGeocodeJob()

    // Nominatim must NOT be called — we skip before geocoding
    expect(global.fetch).not.toHaveBeenCalled()
    expect(db.listing.updateMany).not.toHaveBeenCalled()
  })

  it('skips locked listings within a group while still geocoding the unlocked ones', async () => {
    db.listing.findMany.mockResolvedValue([
      { id: 'l1', city: 'Tampa', state: 'FL' },
      { id: 'l2', city: 'Tampa', state: 'FL' },
    ])
    // l1 lock acquired, l2 not
    db.$executeRaw
      .mockResolvedValueOnce(1) // l1 — acquired
      .mockResolvedValueOnce(0) // l2 — already locked

    mockFetchCoords('27.9506', '-82.4572')

    await runGeocodeJob()

    // Only l1 gets updated
    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1'] } },
      data: { lat: 27.9506, lng: -82.4572 },
    })
  })

  it('releases locks after geocoding, even when geocode fails', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l1', city: 'Tampa', state: 'FL' }])
    // Lock acquired
    db.$executeRaw.mockResolvedValue(1)
    mockFetchEmpty() // geocode returns nothing

    await runGeocodeJob()

    // releaseListingLocks calls updateMany with processingLockedAt: null
    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1'] } },
      data: { processingLockedAt: null },
    })
  })

  it('calls $disconnect when finished', async () => {
    db.listing.findMany.mockResolvedValue([])
    await runGeocodeJob()
    expect(db.$disconnect).toHaveBeenCalledTimes(1)
  })
})
