import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { marketRoutes } from './market.js'

function buildTestApp(db: unknown) {
  const app = Fastify()
  void app.register(sensible)
  void app.register(marketRoutes, { db: db as never })
  return app
}

const PRICING_ROW = {
  count: 42,
  p10: 28000_00,
  p25: 32000_00,
  p50: 38000_00,
  p75: 45000_00,
  p90: 55000_00,
  medianMileage: 44800,
  medianDaysListed: 21.6,
}

const DROP_ROW = { total: 20, dropped: 6 }

describe('GET /pricing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('requires make and model', async () => {
    const app = buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/pricing?make=TOYOTA' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns pricing stats for a make/model', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValueOnce([PRICING_ROW]).mockResolvedValueOnce([DROP_ROW]) }
    const app = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/pricing?make=TOYOTA&model=SIENNA' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.spec).toEqual({ make: 'TOYOTA', model: 'SIENNA' })
    expect(data.count).toBe(42)
    expect(data.priceCents).toMatchObject({ p10: 2800000, p25: 3200000, p50: 3800000, p75: 4500000, p90: 5500000 })
    expect(data.medianMileage).toBe(44800)
    expect(data.medianDaysListed).toBe(22)
    expect(data.priceDropRate).toBeCloseTo(0.3)
    expect(data.priceDropCount).toBe(6)

    await app.close()
  })

  it('includes year and conversionType in spec when provided', async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValueOnce([PRICING_ROW]).mockResolvedValueOnce([DROP_ROW]) }
    const app = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/pricing?make=TOYOTA&model=SIENNA&year=2020&conversionType=rear_entry' })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.spec).toEqual({ make: 'TOYOTA', model: 'SIENNA', year: 2020, conversionType: 'rear_entry' })

    await app.close()
  })

  it('returns null price stats when no listings match', async () => {
    const db = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ count: 0, p10: null, p25: null, p50: null, p75: null, p90: null, medianMileage: null, medianDaysListed: null }])
        .mockResolvedValueOnce([{ total: 0, dropped: 0 }]),
    }
    const app = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/pricing?make=HONDA&model=ODYSSEY' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.count).toBe(0)
    expect(data.priceCents).toBeNull()
    expect(data.medianMileage).toBeNull()
    expect(data.medianDaysListed).toBeNull()
    expect(data.priceDropRate).toBeNull()
    expect(data.priceDropCount).toBe(0)

    await app.close()
  })

  it('rejects unknown conversionType', async () => {
    const app = buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/pricing?make=TOYOTA&model=SIENNA&conversionType=invalid' })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns 500 with error envelope when db throws', async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) }
    const app = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/pricing?make=TOYOTA&model=SIENNA' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pricing data' } })

    await app.close()
  })
})

describe('GET /popular', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns top makes, models, and conversion brands', async () => {
    const db = {
      listing: {
        groupBy: vi.fn()
          .mockResolvedValueOnce([
            { make: 'TOYOTA', _count: { make: 234 } },
            { make: 'HONDA', _count: { make: 87 } },
          ])
          .mockResolvedValueOnce([
            { make: 'TOYOTA', model: 'SIENNA', _count: { make: 189 } },
            { make: 'HONDA', model: 'ODYSSEY', _count: { make: 62 } },
          ])
          .mockResolvedValueOnce([
            { conversionManufacturer: 'BraunAbility', _count: { conversionManufacturer: 156 } },
            { conversionManufacturer: 'VMI', _count: { conversionManufacturer: 98 } },
          ]),
      },
    }
    const app = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/popular' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.makes).toEqual([
      { make: 'TOYOTA', count: 234 },
      { make: 'HONDA', count: 87 },
    ])
    expect(data.models).toEqual([
      { make: 'TOYOTA', model: 'SIENNA', count: 189 },
      { make: 'HONDA', model: 'ODYSSEY', count: 62 },
    ])
    expect(data.conversionBrands).toEqual([
      { conversionManufacturer: 'BraunAbility', count: 156 },
      { conversionManufacturer: 'VMI', count: 98 },
    ])

    await app.close()
  })
})
