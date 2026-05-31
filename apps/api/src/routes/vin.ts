import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'
import { decodeVin, isValidVin, normalizeVin } from '../services/vin-decoder.js'

interface VinPluginOptions {
  db: PrismaClient
}

interface ComplaintGroup {
  component: string
  count: number
  examples: Array<{
    id: string
    nhtsaId: string
    summary: string
    mileage: number | null
    crashInvolved: boolean
    reportedAt: Date
  }>
}

export const vinRoutes: FastifyPluginAsync<VinPluginOptions> = async (app, { db }) => {
  app.get<{ Params: { vin: string } }>('/:vin/safety', async (req, reply) => {
    const vin = normalizeVin(req.params.vin)
    if (!isValidVin(vin)) return reply.badRequest('VIN must be 17 characters and cannot contain I, O, or Q')

    const decoded = await decodeVin(vin)
    if (!decoded) {
      return reply.send({
        data: {
          vin,
          decoded: null,
          vehicleModel: null,
          conversionManufacturer: null,
          sourceListingId: null,
          recalls: [],
          complaints: [],
          complaintGroups: [],
          safetyRatings: [],
          checkedAt: new Date().toISOString(),
        },
      })
    }

    const [vehicleModel, sourceListing] = await Promise.all([
      db.vehicleModel.findFirst({
        where: { make: decoded.make, model: decoded.model, year: decoded.year },
        include: {
          recalls: { orderBy: { reportedAt: 'desc' }, select: { id: true, nhtsaCampaignId: true, component: true, summary: true, remedy: true, reportedAt: true } },
          complaints: { orderBy: { reportedAt: 'desc' }, select: { id: true, nhtsaId: true, component: true, summary: true, mileage: true, crashInvolved: true, reportedAt: true } },
          safetyRatings: { select: { id: true, nhtsaVehicleId: true, description: true, overallRating: true, frontCrashRating: true, sideCrashRating: true, rolloverRating: true, rolloverRatingText: true } },
        },
      }),
      db.listing.findFirst({
        where: { vin },
        select: { id: true, conversionManufacturer: true },
      }),
    ])

    const complaints = vehicleModel?.complaints ?? []

    return reply.send({
      data: {
        vin,
        decoded,
        vehicleModel: vehicleModel
          ? { id: vehicleModel.id, make: vehicleModel.make, model: vehicleModel.model, year: vehicleModel.year, trim: vehicleModel.trim, bodyType: vehicleModel.bodyType }
          : null,
        conversionManufacturer: sourceListing?.conversionManufacturer ?? null,
        sourceListingId: sourceListing?.id ?? null,
        recalls: vehicleModel?.recalls ?? [],
        complaints,
        complaintGroups: groupComplaints(complaints),
        safetyRatings: vehicleModel?.safetyRatings ?? [],
        checkedAt: new Date().toISOString(),
      },
    })
  })
}

function groupComplaints(complaints: Array<ComplaintGroup['examples'][number] & { component: string }>): ComplaintGroup[] {
  const groups = new Map<string, ComplaintGroup>()

  for (const complaint of complaints) {
    const component = complaint.component || 'Uncategorized'
    const group = groups.get(component) ?? { component, count: 0, examples: [] }
    group.count += 1
    if (group.examples.length < 3) {
      group.examples.push({
        id: complaint.id,
        nhtsaId: complaint.nhtsaId,
        summary: complaint.summary,
        mileage: complaint.mileage,
        crashInvolved: complaint.crashInvolved,
        reportedAt: complaint.reportedAt,
      })
    }
    groups.set(component, group)
  }

  return [...groups.values()].sort((a, b) => b.count - a.count || a.component.localeCompare(b.component))
}
