import { getDb } from '@wivwav/db'
import type { JobContext } from '@wivwav/queue'
import { report } from './job-progress.js'
import seeds from '../seeds/vehicle-stats.json' with { type: 'json' }

interface VehicleStatsSeed {
  make: string
  model: string
  year: number | null
  avgLifespanMiles: number | null
  reliabilityScore: number | null
  reliabilitySource: string | null
  jdPowerScore: number | null
  dataSourceName: string | null
  dataSourceUrl: string | null
  methodology: string | null
}

function isValidSourceUrl(url: string | null): boolean {
  if (url === null) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export async function runVehicleStatsRefreshJob(context?: JobContext): Promise<void> {
  const db = getDb()
  const seedData = seeds as VehicleStatsSeed[]

  await report(
    context,
    `[vehicle-stats-refresh] Upserting ${seedData.length} vehicle stat record(s)`,
    {
      stage: 'upserting',
      current: 0,
      total: seedData.length,
    },
  )

  let upserted = 0

  for (let i = 0; i < seedData.length; i++) {
    const seed = seedData[i]!
    const safeDataSourceUrl = isValidSourceUrl(seed.dataSourceUrl) ? seed.dataSourceUrl : null
    const payload = {
      avgLifespanMiles: seed.avgLifespanMiles,
      reliabilityScore: seed.reliabilityScore,
      reliabilitySource: seed.reliabilitySource,
      jdPowerScore: seed.jdPowerScore,
      dataSourceName: seed.dataSourceName,
      dataSourceUrl: safeDataSourceUrl,
      methodology: seed.methodology,
      refreshedAt: new Date(),
    }

    const existing = await db.vehicleStats.findFirst({
      where: { make: seed.make, model: seed.model, year: seed.year },
      select: { id: true },
    })

    if (existing) {
      await db.vehicleStats.update({ where: { id: existing.id }, data: payload })
    } else {
      await db.vehicleStats.create({
        data: { make: seed.make, model: seed.model, year: seed.year, ...payload },
      })
    }

    upserted++

    await report(
      context,
      `[vehicle-stats-refresh] ${i + 1}/${seedData.length} — ${seed.make} ${seed.model}`,
      { stage: 'upserting', current: i + 1, total: seedData.length },
    )
  }

  await report(context, `[vehicle-stats-refresh] Done. ${upserted} record(s) upserted.`, {
    stage: 'complete',
    current: upserted,
    total: seedData.length,
  })
  await db.$disconnect()
}
