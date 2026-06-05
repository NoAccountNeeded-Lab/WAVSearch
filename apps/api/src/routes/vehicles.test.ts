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
            { id: 'src-1', sourceName: 'EPA FuelEconomy.gov', sourceUrl: 'https://www.fueleconomy.gov/feg/bymodel/2020_Toyota_Sienna.shtml', fetchedAt: researchedAt },
          ],
          claims: [
            { id: 'claim-1', field: 'fuelEconomyCombined', claimText: '20 MPG combined', confidence: 'high', sourceId: 'src-1' },
            { id: 'claim-2', field: 'drivetrain', claimText: 'Front-Wheel Drive', confidence: 'high', sourceId: 'src-1' },
          ],
        })),
      },
    }
    const app = buildTestApp(db)
    const res = await app.inject({ method: 'GET', url: '/Toyota/Sienna/2020/research' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.vehicleModel).toMatchObject({ id: 'vm-1', make: 'Toyota', model: 'Sienna', year: 2020 })
    expect(data.researchVersion).toBe(1)
    expect(data.sources).toHaveLength(1)
    expect(data.sources[0]).toMatchObject({ sourceName: 'EPA FuelEconomy.gov' })
    expect(data.claims).toHaveLength(2)
    expect(data.claims[0]).toMatchObject({ field: 'fuelEconomyCombined', claimText: '20 MPG combined' })

    await app.close()
  })
})
