import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'
import type { ListingSearchService } from '../services/listing-search.js'
import type { ListingFacetsService } from '../services/listing-facets.js'

interface ListingsPluginOptions {
  db: PrismaClient
  search: ListingSearchService
  facets: ListingFacetsService
}

interface FilterQuery {
  q?: string
  make?: string
  model?: string
  yearMin?: number
  yearMax?: number
  priceMin?: number
  priceMax?: number
  mileageMax?: number
  condition?: string
  conversionType?: string
  rampType?: string
  hasLift?: boolean
  handControls?: boolean
  color?: string
  state?: string
  sort?: string
  page?: number
  perPage?: number
}

const filterQuerySchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    make: { type: 'string' },
    model: { type: 'string' },
    yearMin: { type: 'integer' },
    yearMax: { type: 'integer' },
    priceMin: { type: 'integer' },
    priceMax: { type: 'integer' },
    mileageMax: { type: 'integer' },
    condition: { type: 'string' },
    conversionType: { type: 'string' },
    rampType: { type: 'string' },
    hasLift: { type: 'boolean' },
    handControls: { type: 'boolean' },
    color: { type: 'string' },
    state: { type: 'string' },
    sort: { type: 'string' },
    page: { type: 'integer', minimum: 1 },
    perPage: { type: 'integer', minimum: 1, maximum: 100 },
  },
  additionalProperties: false,
} as const

export const listingRoutes: FastifyPluginAsync<ListingsPluginOptions> = async (app, { db, search, facets }) => {
  app.get<{ Querystring: FilterQuery }>('/facets', { schema: { querystring: filterQuerySchema } }, async (req, reply) => {
    const q = req.query
    try {
      const result = await facets.getFacets({
        q: q.q,
        make: parseArr(q.make),
        model: parseArr(q.model),
        yearMin: q.yearMin,
        yearMax: q.yearMax,
        priceMin: q.priceMin,
        priceMax: q.priceMax,
        mileageMax: q.mileageMax,
        condition: parseArr(q.condition),
        conversionType: parseArr(q.conversionType),
        rampType: parseArr(q.rampType),
        hasLift: q.hasLift,
        handControls: q.handControls,
        color: parseArr(q.color),
        state: parseArr(q.state),
      })
      return reply.send({ data: result })
    } catch (err) {
      req.log.warn(err, '[facets] Meilisearch unavailable, returning empty distributions')
      return reply.send({
        data: {
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
        },
      })
    }
  })

  app.get<{ Querystring: FilterQuery }>('/', { schema: { querystring: filterQuerySchema } }, async (req, reply) => {
    const q = req.query
    const page = q.page ?? 1
    const perPage = Math.min(100, q.perPage ?? 20)

    try {
      const result = await search.search({
        q: q.q,
        page,
        perPage,
        make: parseArr(q.make),
        model: parseArr(q.model),
        yearMin: q.yearMin,
        yearMax: q.yearMax,
        priceMin: q.priceMin,
        priceMax: q.priceMax,
        mileageMax: q.mileageMax,
        condition: parseArr(q.condition),
        conversionType: parseArr(q.conversionType),
        rampType: parseArr(q.rampType),
        hasLift: q.hasLift,
        handControls: q.handControls,
        color: parseArr(q.color),
        state: parseArr(q.state),
        sort: q.sort,
      })

      return reply.send({
        data: result.hits,
        facets: result.facets,
        pagination: {
          page,
          perPage,
          total: result.total,
          totalPages: Math.ceil(result.total / perPage),
        },
      })
    } catch (err) {
      // Meilisearch unavailable — fall back to plain Prisma query
      req.log.warn(err, '[listings] Meilisearch unavailable, falling back to Prisma')
      const skip = (page - 1) * perPage
      const [rows, total] = await Promise.all([
        db.listing.findMany({ skip, take: perPage, where: { status: 'active' }, orderBy: { listedAt: 'desc' } }),
        db.listing.count({ where: { status: 'active' } }),
      ])
      return reply.send({
        data: rows,
        facets: {},
        pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      })
    }
  })

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const listing = await db.listing.findUnique({ where: { id: req.params.id } })
    if (!listing) return reply.notFound('Listing not found')
    return reply.send({ data: listing })
  })

  app.get<{ Params: { id: string } }>('/:id/price-history', async (req, reply) => {
    const listing = await db.listing.findUnique({ where: { id: req.params.id }, select: { id: true } })
    if (!listing) return reply.notFound('Listing not found')
    const history = await db.listingPriceHistory.findMany({
      where: { listingId: req.params.id },
      orderBy: { recordedAt: 'asc' },
      select: { id: true, priceCents: true, recordedAt: true },
    })
    return reply.send({ data: history })
  })

}

function parseArr(v: string | undefined): string[] | undefined {
  if (!v) return undefined
  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : undefined
}
