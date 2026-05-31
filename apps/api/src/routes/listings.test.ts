import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { listingRoutes } from './listings.js'

function buildTestApp(search = { search: vi.fn(async () => ({ hits: [], total: 0, facets: {} })) }) {
  const app = Fastify()
  const db = {
    listing: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => null),
    },
  }
  const facets = {
    getFacets: vi.fn(async () => ({
      total: 0,
      priceDistribution: [],
      yearDistribution: [],
      mileageDistribution: [],
      makeBreakdown: [],
      modelBreakdown: [],
      stateBreakdown: [],
      conditionBreakdown: [],
      conversionBreakdown: [],
      colorBreakdown: [],
      wavFeatures: { hasLift: 0, handControls: 0, rampTypes: [] },
    })),
  }
  void app.register(listingRoutes, { db: db as never, search: search as never, facets: facets as never })
  return { app, search, facets }
}

describe('GET /', () => {
  it('coerces validated query params before searching', async () => {
    const { app, search } = buildTestApp()

    const res = await app.inject({
      method: 'GET',
      url: '/?page=2&perPage=5&yearMin=2015&hasLift=true&make=Honda,Toyota',
    })

    expect(res.statusCode).toBe(200)
    expect(search.search).toHaveBeenCalledWith(expect.objectContaining({
      page: 2,
      perPage: 5,
      yearMin: 2015,
      hasLift: true,
      make: ['Honda', 'Toyota'],
    }))

    await app.close()
  })

  it('rejects invalid pagination query params', async () => {
    const { app, search } = buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/?perPage=101' })

    expect(res.statusCode).toBe(400)
    expect(search.search).not.toHaveBeenCalled()

    await app.close()
  })
})

describe('GET /facets', () => {
  it('coerces validated facet query params before fetching facets', async () => {
    const { app, facets } = buildTestApp()

    const res = await app.inject({
      method: 'GET',
      url: '/facets?priceMax=5000000&handControls=false&state=CO,UT',
    })

    expect(res.statusCode).toBe(200)
    expect(facets.getFacets).toHaveBeenCalledWith(expect.objectContaining({
      priceMax: 5000000,
      handControls: false,
      state: ['CO', 'UT'],
    }))

    await app.close()
  })

  it('rejects invalid numeric facet query params', async () => {
    const { app, facets } = buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/facets?yearMin=nope' })

    expect(res.statusCode).toBe(400)
    expect(facets.getFacets).not.toHaveBeenCalled()

    await app.close()
  })
})
