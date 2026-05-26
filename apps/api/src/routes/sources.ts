import type { FastifyPluginAsync } from 'fastify'

export const sourceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    return reply.send({ sources: [] })
  })
}
