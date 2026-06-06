import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runVehicleStatsRefreshJob } from './vehicle-stats-refresh.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    vehicleStats: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
    $disconnect: vi.fn(async () => {}),
    ...overrides,
  }
}

// Stub `getDb` so the job uses our mock
vi.mock('@wivwav/db', () => ({
  getDb: vi.fn(),
}))

// Stub the seeds import to control which records are processed
vi.mock('../seeds/vehicle-stats.json', () => ({
  default: [
    {
      make: 'Toyota',
      model: 'Sienna',
      year: null,
      avgLifespanMiles: null,
      reliabilityScore: null,
      reliabilitySource: null,
      jdPowerScore: null,
      dataSourceName: null,
      dataSourceUrl: null,
      methodology:
        'No reliability or lifespan score is populated. WivWav does not calculate reliability scores or scrape commercial score providers; add values only with a public, linkable source.',
    },
    {
      make: 'Honda',
      model: 'Odyssey',
      year: null,
      avgLifespanMiles: 300000,
      reliabilityScore: null,
      reliabilitySource: null,
      jdPowerScore: 82,
      dataSourceName: 'NHTSA',
      dataSourceUrl: 'https://www.nhtsa.gov/',
      methodology: 'Source-backed vehicle facts only.',
    },
  ],
}))

let getDbMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  const mod = await import('@wivwav/db')
  getDbMock = vi.mocked(mod.getDb)
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── runVehicleStatsRefreshJob ─────────────────────────────────────────────────

describe('runVehicleStatsRefreshJob', () => {
  it('creates a new record when no existing stats are found', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    await runVehicleStatsRefreshJob()

    expect(db.vehicleStats.create).toHaveBeenCalledTimes(2)
    expect(db.vehicleStats.update).not.toHaveBeenCalled()
  })

  it('updates an existing record instead of creating a duplicate', async () => {
    const db = makeDb({
      vehicleStats: {
        findFirst: vi.fn(async () => ({ id: 'existing-1' })),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
    })
    getDbMock.mockReturnValue(db)

    await runVehicleStatsRefreshJob()

    expect(db.vehicleStats.update).toHaveBeenCalledTimes(2)
    expect(db.vehicleStats.create).not.toHaveBeenCalled()
  })

  it('writes dataSourceName, dataSourceUrl, and methodology to the payload', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    await runVehicleStatsRefreshJob()

    // Second seed (Honda Odyssey) has dataSourceName/Url and methodology
    const hondaCreateCall = (db.vehicleStats.create as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[0] as { data: { make: string } }).data.make === 'Honda',
    )
    expect(hondaCreateCall).toBeDefined()
    const payload = (hondaCreateCall![0] as { data: Record<string, unknown> }).data
    expect(payload['dataSourceName']).toBe('NHTSA')
    expect(payload['dataSourceUrl']).toBe('https://www.nhtsa.gov/')
    expect(payload['methodology']).toBe('Source-backed vehicle facts only.')
  })

  it('writes null dataSourceName and dataSourceUrl when seed has no source', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    await runVehicleStatsRefreshJob()

    // First seed (Toyota Sienna) has null dataSourceName and dataSourceUrl
    const toyotaCreateCall = (db.vehicleStats.create as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[0] as { data: { make: string } }).data.make === 'Toyota',
    )
    expect(toyotaCreateCall).toBeDefined()
    const payload = (toyotaCreateCall![0] as { data: Record<string, unknown> }).data
    expect(payload['dataSourceName']).toBeNull()
    expect(payload['dataSourceUrl']).toBeNull()
  })

  it('sets a refreshedAt timestamp on every upserted record', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    const before = new Date()
    await runVehicleStatsRefreshJob()
    const after = new Date()

    for (const call of (db.vehicleStats.create as ReturnType<typeof vi.fn>).mock.calls) {
      const refreshedAt = (call[0] as { data: { refreshedAt: Date } }).data.refreshedAt
      expect(refreshedAt).toBeInstanceOf(Date)
      expect(refreshedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(refreshedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    }
  })

  it('calls $disconnect after all records are processed', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    await runVehicleStatsRefreshJob()

    expect(db.$disconnect).toHaveBeenCalledOnce()
  })

  it('processes all seed records even when some already exist', async () => {
    let callCount = 0
    const db = makeDb({
      vehicleStats: {
        // First call returns existing, second returns null
        findFirst: vi.fn(async () => {
          callCount++
          return callCount === 1 ? { id: 'existing-1' } : null
        }),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
    })
    getDbMock.mockReturnValue(db)

    await runVehicleStatsRefreshJob()

    expect(db.vehicleStats.update).toHaveBeenCalledTimes(1)
    expect(db.vehicleStats.create).toHaveBeenCalledTimes(1)
    expect(db.$disconnect).toHaveBeenCalledOnce()
  })
})
