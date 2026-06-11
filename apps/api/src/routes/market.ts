import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wivwav/db'

interface MarketPluginOptions {
  db: PrismaClient
}

interface PricingQuery {
  make: string
  model: string
  year?: number
  conversionType?: string
}

const pricingQuerySchema = {
  type: 'object',
  required: ['make', 'model'],
  properties: {
    make: { type: 'string', minLength: 1 },
    model: { type: 'string', minLength: 1 },
    year: { type: 'integer', minimum: 1980, maximum: 2030 },
    conversionType: { type: 'string', enum: ['rear_entry', 'side_entry', 'unknown'] },
  },
  additionalProperties: false,
} as const

interface PricingRow {
  count: number | bigint
  p10: number | null
  p25: number | null
  p50: number | null
  p75: number | null
  p90: number | null
  medianMileage: number | null
  medianDaysListed: number | null
}

interface PriceDropRow {
  total: number | bigint
  dropped: number | bigint
}

export const marketRoutes: FastifyPluginAsync<MarketPluginOptions> = async (app, { db }) => {
  app.get<{ Querystring: PricingQuery }>('/pricing', { schema: { querystring: pricingQuerySchema } }, async (req, reply) => {
    const { make, model } = req.query
    const year = req.query.year ?? null
    const conversionType = req.query.conversionType ?? null

    try {
      const [pricingRows, dropRows] = await Promise.all([
        db.$queryRaw<PricingRow[]>`
          SELECT
            COUNT(*)::int                                                                                    AS count,
            PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY "priceCents")                                     AS p10,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "priceCents")                                     AS p25,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "priceCents")                                     AS p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "priceCents")                                     AS p75,
            PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY "priceCents")                                     AS p90,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mileage)                                          AS "medianMileage",
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM NOW() - "listedAt") / 86400)   AS "medianDaysListed"
          FROM listings
          WHERE status = 'active'
            AND "isDuplicate" = false
            AND "priceCents" IS NOT NULL
            AND make = ${make}
            AND model = ${model}
            AND (${year}::int IS NULL OR year BETWEEN ${year}::int - 2 AND ${year}::int + 2)
            AND (${conversionType}::text IS NULL OR "conversionType"::text = ${conversionType}::text)
        `,
        db.$queryRaw<PriceDropRow[]>`
          SELECT
            COUNT(DISTINCT l.id)::int                                                                       AS total,
            COUNT(DISTINCT CASE WHEN fp."priceCents" > lp."priceCents" THEN l.id END)::int                 AS dropped
          FROM listings l
          INNER JOIN (
            SELECT DISTINCT ON ("listingId") "listingId", "priceCents"
            FROM listing_price_history
            ORDER BY "listingId", "recordedAt" ASC
          ) fp ON fp."listingId" = l.id
          INNER JOIN (
            SELECT DISTINCT ON ("listingId") "listingId", "priceCents"
            FROM listing_price_history
            ORDER BY "listingId", "recordedAt" DESC
          ) lp ON lp."listingId" = l.id
          WHERE l.status = 'active'
            AND l."isDuplicate" = false
            AND l.make = ${make}
            AND l.model = ${model}
            AND (${year}::int IS NULL OR l.year BETWEEN ${year}::int - 2 AND ${year}::int + 2)
            AND (${conversionType}::text IS NULL OR l."conversionType"::text = ${conversionType}::text)
        `,
      ])

      const pricing = pricingRows[0]
      const drop = dropRows[0]
      const count = Number(pricing?.count ?? 0)
      const total = Number(drop?.total ?? 0)
      const dropped = Number(drop?.dropped ?? 0)

      return reply.send({
        data: {
          spec: {
            make,
            model,
            ...(year !== null && { year }),
            ...(conversionType !== null && { conversionType }),
          },
          count,
          priceCents: count === 0 || pricing == null
            ? null
            : {
                p10: Math.round(pricing.p10 ?? 0),
                p25: Math.round(pricing.p25 ?? 0),
                p50: Math.round(pricing.p50 ?? 0),
                p75: Math.round(pricing.p75 ?? 0),
                p90: Math.round(pricing.p90 ?? 0),
              },
          medianMileage: pricing?.medianMileage != null ? Math.round(pricing.medianMileage) : null,
          medianDaysListed: pricing?.medianDaysListed != null ? Math.round(pricing.medianDaysListed) : null,
          priceDropRate: total > 0 ? Math.round((dropped / total) * 100) / 100 : null,
          priceDropCount: dropped,
        },
      })
    } catch (err) {
      req.log.error(err, 'Failed to fetch pricing data')
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pricing data' } })
    }
  })

  app.get('/popular', async (_req, reply) => {
    try {
      const [makes, models, brands] = await Promise.all([
        db.listing.groupBy({
          by: ['make'],
          where: { status: 'active', isDuplicate: false },
          _count: { make: true },
          orderBy: { _count: { make: 'desc' } },
          take: 10,
        }),
        db.listing.groupBy({
          by: ['make', 'model'],
          where: { status: 'active', isDuplicate: false },
          _count: { make: true },
          orderBy: { _count: { make: 'desc' } },
          take: 10,
        }),
        db.listing.groupBy({
          by: ['conversionManufacturer'],
          where: { status: 'active', isDuplicate: false, conversionManufacturer: { not: null } },
          _count: { conversionManufacturer: true },
          orderBy: { _count: { conversionManufacturer: 'desc' } },
          take: 10,
        }),
      ])

      return reply.send({
        data: {
          makes: makes.map((r) => ({ make: r.make, count: r._count.make })),
          models: models.map((r) => ({ make: r.make, model: r.model, count: r._count.make })),
          conversionBrands: brands
            .filter((r) => r.conversionManufacturer !== null)
            .map((r) => ({ conversionManufacturer: r.conversionManufacturer, count: r._count.conversionManufacturer })),
        },
      })
    } catch (err) {
      app.log.error(err, 'Failed to fetch popular listings data')
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch popular listings data' } })
    }
  })
}
