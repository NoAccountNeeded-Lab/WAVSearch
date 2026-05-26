import type { FastifyPluginAsync } from 'fastify'

export const listingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    return reply.send({ listings: [], aggregations: {}, pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } })
  })

  app.get('/:id', async (_req, reply) => {
    return reply.notFound('Listing not found')
  })
}
