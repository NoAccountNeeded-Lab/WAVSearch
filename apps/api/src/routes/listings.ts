import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'

export const listingRoutes: FastifyPluginAsync<{ db: PrismaClient }> = async (app, { db }) => {
  app.get('/', async (req, reply) => {
    const { page = '1', perPage = '20' } = req.query as Record<string, string>
    const pageNum = Math.max(1, parseInt(page, 10))
    const perPageNum = Math.min(100, Math.max(1, parseInt(perPage, 10)))
    const skip = (pageNum - 1) * perPageNum

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        skip,
        take: perPageNum,
        orderBy: { listedAt: 'desc' },
      }),
      db.listing.count(),
    ])

    return reply.send({
      data: listings,
      pagination: {
        page: pageNum,
        perPage: perPageNum,
        total,
        totalPages: Math.ceil(total / perPageNum),
      },
    })
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const listing = await db.listing.findUnique({ where: { id } })
    if (!listing) return reply.notFound('Listing not found')
    return reply.send({ data: listing })
  })
}
