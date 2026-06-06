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

      const select = {
        make: true,
        model: true,
        year: true,
        avgLifespanMiles: true,
        reliabilityScore: true,
        reliabilitySource: true,
        jdPowerScore: true,
        dataSourceName: true,
        dataSourceUrl: true,
        methodology: true,
        refreshedAt: true,
      } as const
      const baseWhere = { make: req.params.make, model: req.params.model }
      const stats =
        year !== undefined
          ? ((await db.vehicleStats.findFirst({
              where: { ...baseWhere, year },
              select,
            })) ??
            (await db.vehicleStats.findFirst({
              where: { ...baseWhere, year: null },
              select,
            })))
          : await db.vehicleStats.findFirst({
              where: { ...baseWhere, year: null },
              select,
            })

      if (!stats) return reply.send({ data: null })
      const { dataSourceName, dataSourceUrl, ...statsData } = stats
      return reply.send({
        data: {
          ...statsData,
          sources:
            dataSourceName !== null && dataSourceUrl !== null
              ? [{ name: dataSourceName, url: dataSourceUrl }]
              : [],
        },
      })
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

  // GET /v1/vehicles/:make/:model/:year/research — latest cited model facts
  app.get<{ Params: { make: string; model: string; year: string } }>(
    '/:make/:model/:year/research',
    async (req, reply) => {
      const year = parseInt(req.params.year)
      if (isNaN(year)) return reply.badRequest('year must be a number')

      const vm = await db.vehicleModel.findFirst({
        where: { make: req.params.make, model: req.params.model, year },
      })
      if (!vm) return reply.send({ data: null })

      const research = await db.vehicleModelResearch.findFirst({
        where: { vehicleModelId: vm.id },
        orderBy: { researchVersion: 'desc' },
        select: {
          id: true,
          researchVersion: true,
          researchedAt: true,
          sources: {
            select: {
              id: true,
              sourceName: true,
              sourceUrl: true,
              fetchedAt: true,
            },
          },
          claims: {
            orderBy: { field: 'asc' },
            select: {
              id: true,
              field: true,
              claimText: true,
              confidence: true,
              sourceId: true,
            },
          },
        },
      })

      if (!research) return reply.send({ data: null })

      return reply.send({
        data: {
          vehicleModel: { id: vm.id, make: vm.make, model: vm.model, year: vm.year },
          researchVersion: research.researchVersion,
          researchedAt: research.researchedAt,
          sources: research.sources,
          claims: research.claims,
        },
      })
    },
  )
}
