import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'

interface VehiclesPluginOptions {
  db: PrismaClient
}

export const vehicleRoutes: FastifyPluginAsync<VehiclesPluginOptions> = async (app, { db }) => {
  app.get<{ Params: { make: string; model: string; year: string } }>(
    '/:make/:model/:year/recalls',
    async (req, reply) => {
      const year = parseInt(req.params.year)
      if (isNaN(year)) return reply.badRequest('year must be a number')

      const vm = await db.vehicleModel.findFirst({
        where: { make: req.params.make, model: req.params.model, year },
      })
      if (!vm) return reply.send({ data: [] })

      const recalls = await db.recall.findMany({
        where: { vehicleModelId: vm.id },
        orderBy: { reportedAt: 'desc' },
        select: {
          id: true,
          nhtsaCampaignId: true,
          component: true,
          summary: true,
          remedy: true,
          reportedAt: true,
        },
      })

      return reply.send({ data: recalls })
    },
  )

  app.get<{ Params: { make: string; model: string }; Querystring: { year?: string } }>(
    '/:make/:model/stats',
    async (req, reply) => {
      const year = req.query.year !== undefined ? parseInt(req.query.year) : undefined
      if (year !== undefined && isNaN(year)) return reply.badRequest('year must be a number')

      const stats = await db.vehicleStats.findFirst({
        where: {
          make: req.params.make,
          model: req.params.model,
          year: year ?? null,
        },
        select: {
          make: true,
          model: true,
          year: true,
          avgLifespanMiles: true,
          reliabilityScore: true,
          reliabilitySource: true,
          jdPowerScore: true,
          refreshedAt: true,
        },
      })

      if (!stats) return reply.send({ data: null })
      return reply.send({ data: stats })
    },
  )

  app.get<{ Params: { make: string; model: string; year: string } }>(
    '/:make/:model/:year/complaints',
    async (req, reply) => {
      const year = parseInt(req.params.year)
      if (isNaN(year)) return reply.badRequest('year must be a number')

      const vm = await db.vehicleModel.findFirst({
        where: { make: req.params.make, model: req.params.model, year },
      })
      if (!vm) return reply.send({ data: [] })

      const complaints = await db.complaint.findMany({
        where: { vehicleModelId: vm.id },
        orderBy: { reportedAt: 'desc' },
        select: {
          id: true,
          nhtsaId: true,
          component: true,
          summary: true,
          mileage: true,
          crashInvolved: true,
          reportedAt: true,
        },
      })

      return reply.send({ data: complaints })
    },
  )
}
