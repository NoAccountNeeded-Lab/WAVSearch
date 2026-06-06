import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { describe, expect, it, vi } from 'vitest'
import { listingRoutes } from './listings.js'

const defaultDbListing = {
  id: 'listing-1',
  sourceId: 'source-1',
  sourceUrl: 'https://dealer.example.com/listing/1',
  buyerUrl: null,
  externalId: null,
  make: 'Toyota',
  model: 'Sienna',
  year: 2022,
  trim: null,
  vin: null,
  condition: 'used',
  sellerType: 'dealer',
  priceCents: 3500000,
  mileage: 20000,
  color: null,
  fuelType: null,
  transmission: null,
  conversionType: 'rear_entry',
  conversionManufacturer: null,
  floorLoweringInches: null,
  rampType: 'in_floor',
  hasLift: false,
  handControls: false,
  transferSeat: false,
  wheelchairCapacity: null,
  zip: null,
  city: null,
  state: 'CO',
  lat: null,
  lng: null,
  vehicleModelId: null,
  vehicleModelMatchConfidence: null,
  dealerName: null,
  dealerPhone: null,
  dealerWebsite: null,
  images: [],
  description: null,
  isDuplicate: false,
  canonicalId: null,
  status: 'active',
  saleStatus: 'active',
  goneAt: null,
  soldAt: null,
  listedAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  scrapedAt: new Date('2024-01-02'),
  detailScrapedAt: null,
  source: {
    name: 'Example Dealer',
    baseUrl: 'https://dealer.example.com',
  },
}

function buildTestApp(
  search = { search: vi.fn(async () => ({ hits: [] as unknown[], total: 0, facets: {} as Record<string, unknown> })) },
  dbOverrides: Partial<{ findUnique: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]>; count: () => Promise<number> }> = {},
  facetsOverrides: Partial<{ getFacets: (args: unknown) => Promise<unknown> }> = {},
) {
  const app = Fastify()
  void app.register(sensible)
  const db = {
    listing: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findUnique: vi.fn(async () => null),
      ...dbOverrides,
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
    ...facetsOverrides,
  }
  void app.register(listingRoutes, { db: db as never, search: search as never, facets: facets as never })
  return { app, db, search, facets }
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

  it('returns correct pagination shape in the response', async () => {
    const search = { search: vi.fn(async () => ({ hits: [{ id: 'a' }, { id: 'b' }], total: 42, facets: { make: { Toyota: 5 } } })) }
    const { app } = buildTestApp(search)

    const res = await app.inject({ method: 'GET', url: '/?page=3&perPage=10' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ pagination: Record<string, unknown>; facets: unknown }>()
    expect(body.pagination).toEqual({ page: 3, perPage: 10, total: 42, totalPages: 5 })
    expect(body.facets).toEqual({ make: { Toyota: 5 } })

    await app.close()
  })

  it('falls back to Prisma when Meilisearch is unavailable', async () => {
    const failingSearch = { search: vi.fn(async () => { throw new Error('Meilisearch down') }) }
    const dbListings = [{ id: 'row-1' }]
    const { app, db } = buildTestApp(failingSearch, {
      findMany: vi.fn(async () => dbListings),
      count: vi.fn(async () => 7),
    })

    const res = await app.inject({ method: 'GET', url: '/?page=2&perPage=5' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: unknown[]; facets: unknown; pagination: Record<string, unknown> }>()
    expect(body.data).toEqual(dbListings)
    expect(body.facets).toEqual({})
    expect(body.pagination).toEqual({ page: 2, perPage: 5, total: 7, totalPages: 2 })
    expect(db.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }))

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

  it('returns empty distributions when Meilisearch is unavailable', async () => {
    const { app } = buildTestApp(undefined, {}, {
      getFacets: vi.fn(async () => { throw new Error('Meilisearch down') }),
    })

    const res = await app.inject({ method: 'GET', url: '/facets' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Record<string, unknown> }>()
    expect(body.data).toEqual({
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
    })

    await app.close()
  })
})

describe('GET /:id — provenance', () => {
  it('returns 404 when listing does not exist', async () => {
    const { app } = buildTestApp()

    const res = await app.inject({ method: 'GET', url: '/nonexistent-id' })

    expect(res.statusCode).toBe(404)

    await app.close()
  })

  it('returns full provenance when all fields are present', async () => {
    const listing = {
      ...defaultDbListing,
      buyerUrl: 'https://dealer.example.com/buy/1',
      detailScrapedAt: new Date('2024-01-03'),
      vehicleModelMatchConfidence: 'high',
    }
    const { app } = buildTestApp(undefined, { findUnique: vi.fn(async () => listing) })

    const res = await app.inject({ method: 'GET', url: '/listing-1' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: { provenance: Record<string, unknown> } }>()
    expect(body.data.provenance).toMatchObject({
      sourceName: 'Example Dealer',
      sourceBaseUrl: 'https://dealer.example.com',
      sourceUrl: 'https://dealer.example.com/listing/1',
      buyerUrl: 'https://dealer.example.com/buy/1',
      detailScrapedAt: '2024-01-03T00:00:00.000Z',
      vehicleModelMatchConfidence: 'high',
    })

    await app.close()
  })

  it('returns null for optional provenance fields when absent', async () => {
    const { app } = buildTestApp(undefined, { findUnique: vi.fn(async () => defaultDbListing) })

    const res = await app.inject({ method: 'GET', url: '/listing-1' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: { provenance: Record<string, unknown> } }>()
    expect(body.data.provenance).toMatchObject({
      sourceName: 'Example Dealer',
      sourceBaseUrl: 'https://dealer.example.com',
      sourceUrl: 'https://dealer.example.com/listing/1',
      buyerUrl: null,
      detailScrapedAt: null,
      vehicleModelMatchConfidence: null,
    })

    await app.close()
  })

  it('wraps response in { data } envelope', async () => {
    const { app } = buildTestApp(undefined, { findUnique: vi.fn(async () => defaultDbListing) })

    const res = await app.inject({ method: 'GET', url: '/listing-1' })

    expect(res.statusCode).toBe(200)
    const body = res.json<Record<string, unknown>>()
    expect(Object.keys(body)).toContain('data')
    expect(Object.keys(body)).not.toContain('error')

    await app.close()
  })

  it('does not leak the raw source relation into the top-level response', async () => {
    const { app } = buildTestApp(undefined, { findUnique: vi.fn(async () => defaultDbListing) })

    const res = await app.inject({ method: 'GET', url: '/listing-1' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: Record<string, unknown> }>()
    expect(body.data.source).toBeUndefined()
    expect(body.data.sourceId).toBeUndefined()

    await app.close()
  })
})
