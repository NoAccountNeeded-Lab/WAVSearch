import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runModelResearchJob } from './model-research.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEpaResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      vehicle: [
        {
          id: 1,
          make: 'Toyota',
          model: 'Sienna',
          year: 2020,
          city08: 19,
          hwy08: 27,
          pv4: 22,
          drive: 'Front-Wheel Drive',
          eng_dscr: '3.5L V6',
          fuelType: 'Regular Gasoline',
          trany: 'Automatic 8-spd',
          ...overrides,
        },
      ],
    }),
  }
}

function makeDb(overrides: Record<string, unknown> = {}) {
  const createManyMock = vi.fn(async () => ({ count: 0 }))
  const createMock = vi.fn(async (args: { data: unknown; include?: unknown }) => {
    const data = args.data as Record<string, unknown>
    return {
      id: 'res-1',
      vehicleModelId: 'vm-1',
      researchVersion: data['researchVersion'] ?? 1,
      sources: [
        { id: 'src-epa', sourceName: 'EPA FuelEconomy.gov' },
      ],
    }
  })

  return {
    vehicleModel: {
      findMany: vi.fn(async () => [
        { id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 },
      ]),
    },
    vehicleModelResearch: {
      findFirst: vi.fn(async () => null),
      create: createMock,
    },
    vehicleModelClaim: {
      createMany: createManyMock,
    },
    $disconnect: vi.fn(async () => {}),
    ...overrides,
  }
}

// Stub `getDb` so the job uses our mock
vi.mock('@wav-search/db', () => ({
  getDb: vi.fn(),
}))

let getDbMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  const mod = await import('@wav-search/db')
  getDbMock = vi.mocked(mod.getDb)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ── buildEpaClaims (via runModelResearchJob integration) ──────────────────────

describe('runModelResearchJob', () => {
  it('stores all EPA claims when all fields present', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    vi.stubGlobal('fetch', vi.fn(async () => makeEpaResponse()))

    await runModelResearchJob()

    expect(db.vehicleModelResearch.create).toHaveBeenCalledOnce()
    const createArgs = (db.vehicleModelResearch.create as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    // Only EPA source should be created inline
    expect(createArgs.data.sources.create).toHaveLength(1)
    expect(createArgs.data.sources.create[0].sourceName).toBe('EPA FuelEconomy.gov')

    expect(db.vehicleModelClaim.createMany).toHaveBeenCalledOnce()
    const claimsArg = (db.vehicleModelClaim.createMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    const fields = claimsArg.data.map((c: { field: string }) => c.field)
    expect(fields).toContain('fuelEconomyCity')
    expect(fields).toContain('fuelEconomyHwy')
    expect(fields).toContain('fuelEconomyCombined')
    expect(fields).toContain('drivetrain')
    expect(fields).toContain('engineDescription')
    expect(fields).toContain('fuelType')
    expect(fields).toContain('transmission')
  })

  it('skips a model already at RESEARCH_VERSION', async () => {
    const db = makeDb({
      vehicleModelResearch: {
        findFirst: vi.fn(async () => ({ id: 'existing-res' })),
        create: vi.fn(),
      },
    })
    getDbMock.mockReturnValue(db)
    vi.stubGlobal('fetch', vi.fn())

    await runModelResearchJob()

    expect(db.vehicleModelResearch.create).not.toHaveBeenCalled()
    // fetch should not have been called since we short-circuited
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips a model when EPA returns no data', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ vehicle: [] }),
    })))

    await runModelResearchJob()

    // No research record should be created
    expect(db.vehicleModelResearch.create).not.toHaveBeenCalled()
    expect(db.vehicleModelClaim.createMany).not.toHaveBeenCalled()
  })

  it('skips a model when EPA fetch returns non-ok', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))

    await runModelResearchJob()

    expect(db.vehicleModelResearch.create).not.toHaveBeenCalled()
  })

  it('does not create claims when EPA data has no recognized fields', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    // EPA vehicle with all numeric MPG fields at 0 and no string fields
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        vehicle: [{ id: 1, make: 'Toyota', model: 'Sienna', year: 2020, city08: 0, hwy08: 0 }],
      }),
    })))

    await runModelResearchJob()

    // Research record is created (EPA data was non-null) but createMany is skipped
    expect(db.vehicleModelResearch.create).toHaveBeenCalledOnce()
    expect(db.vehicleModelClaim.createMany).not.toHaveBeenCalled()
  })

  it('uses combMpgData before pv4 for combined MPG', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    vi.stubGlobal('fetch', vi.fn(async () => makeEpaResponse({ combMpgData: 25, pv4: 22, city08: 0, hwy08: 0 })))

    await runModelResearchJob()

    const claimsArg = (db.vehicleModelClaim.createMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const combined = claimsArg?.data.find((c: { field: string; claimText: string }) => c.field === 'fuelEconomyCombined')
    expect(combined?.claimText).toBe('25 MPG combined')
  })

  it('falls back to displ+cylinders description when eng_dscr absent', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    vi.stubGlobal('fetch', vi.fn(async () => makeEpaResponse({ eng_dscr: undefined, displ: 3.5, cylinders: 6, city08: 0, hwy08: 0 })))

    await runModelResearchJob()

    const claimsArg = (db.vehicleModelClaim.createMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const engine = claimsArg?.data.find((c: { field: string; claimText: string }) => c.field === 'engineDescription')
    expect(engine?.claimText).toBe('3.5L 6-cylinder')
  })

  it('skips a model when EPA fetch throws a network error', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error') }))

    await runModelResearchJob()

    // fetchEpaData catches and returns null — no research record created
    expect(db.vehicleModelResearch.create).not.toHaveBeenCalled()
    expect(db.vehicleModelClaim.createMany).not.toHaveBeenCalled()
  })

  it('falls back to pv4 for combined MPG when combMpgData is absent', async () => {
    const db = makeDb()
    getDbMock.mockReturnValue(db)

    // combMpgData omitted; pv4 should be used
    vi.stubGlobal('fetch', vi.fn(async () => makeEpaResponse({ pv4: 23, city08: 0, hwy08: 0 })))

    await runModelResearchJob()

    const claimsArg = (db.vehicleModelClaim.createMany as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const combined = claimsArg?.data.find((c: { field: string; claimText: string }) => c.field === 'fuelEconomyCombined')
    expect(combined?.claimText).toBe('23 MPG combined')
  })

  it('processes multiple models in sequence and calls $disconnect once', async () => {
    const createMock = vi.fn(async () => ({
      id: 'res-1',
      vehicleModelId: 'vm-1',
      researchVersion: 1,
      sources: [{ id: 'src-epa', sourceName: 'EPA FuelEconomy.gov' }],
    }))
    const db = {
      vehicleModel: {
        findMany: vi.fn(async () => [
          { id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 },
          { id: 'vm-2', make: 'Honda', model: 'Odyssey', year: 2021 },
        ]),
      },
      vehicleModelResearch: {
        findFirst: vi.fn(async () => null),
        create: createMock,
      },
      vehicleModelClaim: {
        createMany: vi.fn(async () => ({ count: 0 })),
      },
      $disconnect: vi.fn(async () => {}),
    }
    getDbMock.mockReturnValue(db)

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++
      return makeEpaResponse()
    }))

    await runModelResearchJob()

    // Both models should have been fetched and researched
    expect(callCount).toBe(2)
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(db.$disconnect).toHaveBeenCalledOnce()
  })
})
