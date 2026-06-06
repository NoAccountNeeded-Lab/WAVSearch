import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { describe, expect, it, vi } from 'vitest'
import { vehicleRoutes } from './vehicles.js'

function buildTestApp(db: unknown) {
  const app = Fastify()
  void app.register(sensible)
  void app.register(vehicleRoutes, { db: db as never })
  return app
}

// ── GET /:make/:model/:year/recalls ───────────────────────────────────────────

describe('GET /:make/:model/:year/recalls', () => {
  it('returns 400 when year is not a number', async () => {
    const app = buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/abc/recalls' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns empty data when no VehicleModel is found', async () => {
    const db = {
      vehicleModel: { findFirst: vi.fn(async () => null) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/recalls' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual([])
    await app.close()
  })

  it('returns recalls ordered by reportedAt desc', async () => {
    const vm = { id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 }
    const recalls = [
      {
        id: 'r1',
        nhtsaCampaignId: 'NC-1',
        component: 'Brakes',
        summary: 'Brake issue',
        remedy: null,
        reportedAt: new Date('2024-01-01'),
      },
      {
        id: 'r2',
        nhtsaCampaignId: 'NC-2',
        component: 'Engine',
        summary: 'Engine issue',
        remedy: 'Replace',
        reportedAt: new Date('2023-06-01'),
      },
    ]
    const db = {
      vehicleModel: { findFirst: vi.fn(async () => vm) },
      recall: { findMany: vi.fn(async () => recalls) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/recalls' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(2)
    expect(res.json().data[0].nhtsaCampaignId).toBe('NC-1')
    await app.close()
  })
})

// ── GET /:make/:model/stats ───────────────────────────────────────────────────

describe('GET /:make/:model/stats', () => {
  it('returns 400 when year query param is not a number', async () => {
    const app = buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats?year=abc' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns null data when no stats record exists', async () => {
    const db = {
      vehicleStats: { findFirst: vi.fn(async () => null) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toBeNull()
    await app.close()
  })

  it('returns stats with visible source metadata when found without year filter', async () => {
    const stats = {
      make: 'Toyota',
      model: 'Sienna',
      year: null,
      avgLifespanMiles: null,
      reliabilityScore: null,
      reliabilitySource: null,
      jdPowerScore: null,
      dataSourceName: 'NHTSA',
      dataSourceUrl: 'https://www.nhtsa.gov/vehicle/2020/TOYOTA/SIENNA/VAN/FWD',
      methodology:
        'Source-backed vehicle facts only; no WAVSearch reliability score is calculated.',
      refreshedAt: new Date('2026-01-01'),
    }
    const db = {
      vehicleStats: { findFirst: vi.fn(async () => stats) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      make: 'Toyota',
      model: 'Sienna',
      reliabilityScore: null,
      methodology:
        'Source-backed vehicle facts only; no WAVSearch reliability score is calculated.',
      sources: [{ name: 'NHTSA', url: 'https://www.nhtsa.gov/vehicle/2020/TOYOTA/SIENNA/VAN/FWD' }],
    })
    await app.close()
  })

  it('returns an empty sources list when no linkable source exists', async () => {
    const stats = {
      make: 'Toyota',
      model: 'Sienna',
      year: null,
      avgLifespanMiles: null,
      reliabilityScore: null,
      reliabilitySource: null,
      jdPowerScore: null,
      dataSourceName: null,
      dataSourceUrl: null,
      methodology: 'No reliability or lifespan score is populated.',
      refreshedAt: new Date('2026-01-01'),
    }
    const db = {
      vehicleStats: { findFirst: vi.fn(async () => stats) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.sources).toEqual([])
    await app.close()
  })

  it('passes year filter to db query when year query param is provided', async () => {
    const db = {
      vehicleStats: { findFirst: vi.fn(async () => null) },
    }
    const app = buildTestApp(db)
    await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats?year=2020' })
    expect(db.vehicleStats.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ year: 2020 }) }),
    )
    await app.close()
  })

  it('returns an empty sources list when only one of dataSourceName/dataSourceUrl is non-null', async () => {
    const stats = {
      make: 'Toyota',
      model: 'Sienna',
      year: null,
      avgLifespanMiles: null,
      reliabilityScore: null,
      reliabilitySource: null,
      jdPowerScore: null,
      dataSourceName: 'NHTSA',
      dataSourceUrl: null,
      methodology: null,
      refreshedAt: new Date('2026-01-01'),
    }
    const db = {
      vehicleStats: { findFirst: vi.fn(async () => stats) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.sources).toEqual([])
    await app.close()
  })

  it('falls back to generic make/model stats when year-specific stats are missing', async () => {
    const genericStats = {
      make: 'Toyota',
      model: 'Sienna',
      year: null,
      avgLifespanMiles: null,
      reliabilityScore: null,
      reliabilitySource: null,
      jdPowerScore: null,
      dataSourceName: null,
      dataSourceUrl: null,
      methodology: 'No reliability or lifespan score is populated.',
      refreshedAt: new Date('2026-01-01'),
    }
    const db = {
      vehicleStats: {
        findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(genericStats),
      },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/stats?year=2020' })
    expect(res.statusCode).toBe(200)
    expect(db.vehicleStats.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ year: 2020 }) }),
    )
    expect(db.vehicleStats.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ year: null }) }),
    )
    expect(res.json().data).toMatchObject({ year: null, methodology: genericStats.methodology })
    await app.close()
  })
})

// ── GET /:make/:model/:year/complaints ────────────────────────────────────────

describe('GET /:make/:model/:year/complaints', () => {
  it('returns 400 when year is not a number', async () => {
    const app = buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/bad/complaints' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns empty data when no VehicleModel is found', async () => {
    const db = {
      vehicleModel: { findFirst: vi.fn(async () => null) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/complaints' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual([])
    await app.close()
  })

  it('returns complaints when VehicleModel exists', async () => {
    const vm = { id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 }
    const complaints = [
      {
        id: 'c1',
        nhtsaId: 'NHTSA-1',
        component: 'Fuel system',
        summary: 'Fuel leak',
        mileage: 50000,
        crashInvolved: false,
        reportedAt: new Date('2024-03-01'),
      },
    ]
    const db = {
      vehicleModel: { findFirst: vi.fn(async () => vm) },
      complaint: { findMany: vi.fn(async () => complaints) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/complaints' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toHaveLength(1)
    expect(res.json().data[0].nhtsaId).toBe('NHTSA-1')
    await app.close()
  })
})

// ── GET /:make/:model/:year/research ──────────────────────────────────────────

describe('GET /:make/:model/:year/research', () => {
  it('returns 400 when year is not a number', async () => {
    const app = buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/notanumber/research' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns null data when no VehicleModel is found', async () => {
    const db = {
      vehicleModel: { findFirst: vi.fn(async () => null) },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/research' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toBeNull()
    await app.close()
  })

  it('returns null data when VehicleModel exists but has no research', async () => {
    const db = {
      vehicleModel: {
        findFirst: vi.fn(async () => ({ id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 })),
      },
      vehicleModelResearch: {
        findFirst: vi.fn(async () => null),
      },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/research' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toBeNull()
    await app.close()
  })

  it('returns research with sources and claims', async () => {
    const researchedAt = new Date('2026-06-01T00:00:00.000Z')
    const db = {
      vehicleModel: {
        findFirst: vi.fn(async () => ({ id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 })),
      },
      vehicleModelResearch: {
        findFirst: vi.fn(async () => ({
          id: 'res-1',
          researchVersion: 1,
          researchedAt,
          sources: [
            {
              id: 'src-1',
              sourceName: 'EPA FuelEconomy.gov',
              sourceUrl: 'https://www.fueleconomy.gov/feg/bymodel/2020_Toyota_Sienna.shtml',
              fetchedAt: researchedAt,
            },
          ],
          claims: [
            {
              id: 'claim-1',
              field: 'fuelEconomyCombined',
              claimText: '20 MPG combined',
              confidence: 'high',
              sourceId: 'src-1',
            },
            {
              id: 'claim-2',
              field: 'drivetrain',
              claimText: 'Front-Wheel Drive',
              confidence: 'high',
              sourceId: 'src-1',
            },
          ],
        })),
      },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/research' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.vehicleModel).toMatchObject({
      id: 'vm-1',
      make: 'Toyota',
      model: 'Sienna',
      year: 2020,
    })
    expect(data.researchVersion).toBe(1)
    expect(data.sources).toHaveLength(1)
    expect(data.sources[0]).toMatchObject({ sourceName: 'EPA FuelEconomy.gov' })
    expect(data.claims).toHaveLength(2)
    expect(data.claims[0]).toMatchObject({
      field: 'fuelEconomyCombined',
      claimText: '20 MPG combined',
    })

    await app.close()
  })
})
