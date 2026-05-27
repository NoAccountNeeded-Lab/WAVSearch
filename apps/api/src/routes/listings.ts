import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'
import type { ListingSearchService } from '../services/listing-search.js'

interface ListingsPluginOptions {
  db: PrismaClient
  search: ListingSearchService
}

export const listingRoutes: FastifyPluginAsync<ListingsPluginOptions> = async (app, { db, search }) => {
  app.get('/', async (req, reply) => {
    const qs = req.query as Record<string, string>
    const page = parseNum(qs.page) ?? 1
    const perPage = Math.min(100, parseNum(qs.perPage) ?? 20)

    try {
      const result = await search.search({
        q: qs.q,
        page,
        perPage,
        make: parseArr(qs.make),
        model: parseArr(qs.model),
        yearMin: parseNum(qs.yearMin),
        yearMax: parseNum(qs.yearMax),
        priceMin: parseNum(qs.priceMin),
        priceMax: parseNum(qs.priceMax),
        mileageMax: parseNum(qs.mileageMax),
        condition: parseArr(qs.condition),
        conversionType: parseArr(qs.conversionType),
        rampType: parseArr(qs.rampType),
        hasLift: parseBool(qs.hasLift),
        state: parseArr(qs.state),
        sort: qs.sort,
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
        db.listing.findMany({ skip, take: perPage, orderBy: { listedAt: 'desc' } }),
        db.listing.count(),
      ])
      return reply.send({
        data: rows,
        facets: {},
        pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
      })
    }
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const listing = await db.listing.findUnique({ where: { id } })
    if (!listing) return reply.notFound('Listing not found')
    return reply.send({ data: listing })
  })

  app.get('/:id/price-history', async (req, reply) => {
    const { id } = req.params as { id: string }
    const listing = await db.listing.findUnique({ where: { id }, select: { id: true } })
    if (!listing) return reply.notFound('Listing not found')
    const history = await db.listingPriceHistory.findMany({
      where: { listingId: id },
      orderBy: { recordedAt: 'asc' },
      select: { id: true, priceCents: true, recordedAt: true },
    })
    return reply.send({ data: history })
  })

  // Re-index all listings into Meilisearch (called by scraper after a run, or on demand)
  app.post('/sync', async (_req, reply) => {
    const count = await search.syncAll(db)
    return reply.send({ data: { synced: count } })
  })
}

function parseArr(v: string | undefined): string[] | undefined {
  if (!v) return undefined
  const parts = v.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length ? parts : undefined
}

function parseNum(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = parseInt(v, 10)
  return isNaN(n) ? undefined : n
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === 'true') return true
  if (v === 'false') return false
  return undefined
}
