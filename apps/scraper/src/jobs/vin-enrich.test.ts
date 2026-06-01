import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeVehicleField } from './normalize-vehicle-fields.js'

// Mock DB and fetch before importing the job
vi.mock('@wav-search/db', () => ({ getDb: vi.fn() }))
vi.mock('@wav-search/search', () => ({ syncListings: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/meili.js', () => ({ getMeiliClient: vi.fn() }))

import { getDb } from '@wav-search/db'
import { runVinEnrichJob } from './vin-enrich.js'

// ── normalizeVehicleField ────────────────────────────────────────────────────

describe('normalizeVehicleField', () => {
  it('lowercases ASCII strings', () => {
    expect(normalizeVehicleField('TOYOTA')).toBe('toyota')
    expect(normalizeVehicleField('Sienna')).toBe('sienna')
    expect(normalizeVehicleField('LE Premium')).toBe('le premium')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeVehicleField('  Toyota  ')).toBe('toyota')
  })

  it('returns null for null/undefined/empty', () => {
    expect(normalizeVehicleField(null)).toBeNull()
    expect(normalizeVehicleField(undefined)).toBeNull()
    expect(normalizeVehicleField('')).toBeNull()
  })
})

// ── runVinEnrichJob ──────────────────────────────────────────────────────────

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    listing: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    vehicleModel: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function mockFetch(decoded: Record<string, string>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        Results: Object.entries(decoded).map(([Variable, Value]) => ({ Variable, Value })),
      }),
  })
}

describe('runVinEnrichJob — case normalization', () => {
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
    vi.mocked(getDb).mockReturnValue(db as never)
  })

  it('normalizes VPIC make/model/trim to lowercase before lookup and create', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l1', vin: '1ABCD' }])
    mockFetch({ Make: 'TOYOTA', Model: 'SIENNA', 'Model Year': '2020', Trim: 'LE', 'Body Class': 'Van' })
    db.vehicleModel.create.mockResolvedValue({ id: 'vm1', bodyType: 'van' })

    await runVinEnrichJob()

    expect(db.vehicleModel.findFirst).toHaveBeenCalledWith({
      where: { make: 'toyota', model: 'sienna', year: 2020, trim: 'le' },
    })
    expect(db.vehicleModel.create).toHaveBeenCalledWith({
      data: { make: 'toyota', model: 'sienna', year: 2020, trim: 'le', bodyType: 'van' },
    })
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { vehicleModelId: 'vm1', vehicleModelMatchConfidence: 'exact' },
    })
  })

  it('returns confidence=exact when an exact record already exists', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l2', vin: '2ABCD' }])
    mockFetch({ Make: 'Honda', Model: 'Odyssey', 'Model Year': '2019', Trim: 'EX', 'Body Class': 'Van' })
    db.vehicleModel.findFirst.mockResolvedValueOnce({ id: 'vm2', bodyType: 'van' })

    await runVinEnrichJob()

    expect(db.vehicleModel.create).not.toHaveBeenCalled()
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'l2' },
      data: { vehicleModelId: 'vm2', vehicleModelMatchConfidence: 'exact' },
    })
  })

  it('falls back to trim-absent record and returns confidence=trim_fallback', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l3', vin: '3ABCD' }])
    mockFetch({ Make: 'Chrysler', Model: 'Pacifica', 'Model Year': '2022', Trim: 'Touring L', 'Body Class': 'Van' })

    // First findFirst (exact with trim='touring l') returns null
    db.vehicleModel.findFirst
      .mockResolvedValueOnce(null)
      // Second findFirst (trim=null fallback) returns a record
      .mockResolvedValueOnce({ id: 'vm3', bodyType: 'van' })

    await runVinEnrichJob()

    expect(db.vehicleModel.findFirst).toHaveBeenNthCalledWith(2, {
      where: { make: 'chrysler', model: 'pacifica', year: 2022, trim: null },
    })
    expect(db.vehicleModel.create).not.toHaveBeenCalled()
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'l3' },
      data: { vehicleModelId: 'vm3', vehicleModelMatchConfidence: 'trim_fallback' },
    })
  })

  it('creates a new record when no exact or trim-absent match exists', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l4', vin: '4ABCD' }])
    mockFetch({ Make: 'Ford', Model: 'Transit', 'Model Year': '2021', Trim: 'XLT', 'Body Class': 'Van' })
    db.vehicleModel.findFirst.mockResolvedValue(null)
    db.vehicleModel.create.mockResolvedValue({ id: 'vm4', bodyType: 'van' })

    await runVinEnrichJob()

    expect(db.vehicleModel.create).toHaveBeenCalledWith({
      data: { make: 'ford', model: 'transit', year: 2021, trim: 'xlt', bodyType: 'van' },
    })
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: 'l4' },
      data: { vehicleModelId: 'vm4', vehicleModelMatchConfidence: 'exact' },
    })
  })

  it('skips trim fallback when decoded trim is null', async () => {
    db.listing.findMany.mockResolvedValue([{ id: 'l5', vin: '5ABCD' }])
    mockFetch({ Make: 'Toyota', Model: 'Sienna', 'Model Year': '2018' })
    db.vehicleModel.findFirst.mockResolvedValueOnce(null)
    db.vehicleModel.create.mockResolvedValue({ id: 'vm5', bodyType: null })

    await runVinEnrichJob()

    // Only one findFirst call — no fallback attempted when trim is already null
    expect(db.vehicleModel.findFirst).toHaveBeenCalledTimes(1)
    expect(db.vehicleModel.create).toHaveBeenCalledWith({
      data: { make: 'toyota', model: 'sienna', year: 2018, trim: null, bodyType: null },
    })
  })
})
