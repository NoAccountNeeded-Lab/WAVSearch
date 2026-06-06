import { getDb } from '@wivwav/db'
import type { JobContext } from '@wivwav/queue'
import { report } from './job-progress.js'

const RATINGS_BASE = 'https://api.nhtsa.gov/SafetyRatings'
const RATE_LIMIT_MS = 300

interface RatingsVariant {
  VehicleId: number
  VehicleDescription?: string
}

interface RatingsVariantsResponse {
  Results?: RatingsVariant[]
}

interface RatingsDetail {
  VehicleId: number
  VehicleDescription?: string
  OverallRating?: string
  OverallFrontCrashRating?: string
  OverallSideCrashRating?: string
  RolloverRating?: string
  RolloverRating2?: string
}

interface RatingsDetailResponse {
  Results?: RatingsDetail[]
}

function parseStar(val: string | null | undefined): number | null {
  if (!val) return null
  const n = parseInt(val)
  return isNaN(n) ? null : n
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchVariants(make: string, model: string, year: number): Promise<RatingsVariant[]> {
  const res = await fetch(`${RATINGS_BASE}/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`, {
    headers: { 'User-Agent': 'WivWav/1.0 (wivwav.com)' },
  })
  if (!res.ok) return []
  const data: RatingsVariantsResponse = await res.json()
  return data.Results ?? []
}

async function fetchRatings(vehicleId: number): Promise<RatingsDetail | null> {
  const res = await fetch(`${RATINGS_BASE}/VehicleId/${vehicleId}`, {
    headers: { 'User-Agent': 'WivWav/1.0 (wivwav.com)' },
  })
  if (!res.ok) return null
  const data: RatingsDetailResponse = await res.json()
  return data.Results?.[0] ?? null
}

export async function runNhtsaSafetyRatingsJob(context?: JobContext): Promise<void> {
  const db = getDb()

  const models = await db.vehicleModel.findMany({
    select: { id: true, make: true, model: true, year: true },
  })

  await report(context, `[nhtsa-safety-ratings] ${models.length} vehicle model(s) to refresh`, {
    stage: 'fetching',
    current: 0,
    total: models.length,
  })

  let upserted = 0

  for (let i = 0; i < models.length; i++) {
    const vm = models[i]!
    const variants = await fetchVariants(vm.make, vm.model, vm.year)

    for (const variant of variants) {
      await sleep(RATE_LIMIT_MS)
      const detail = await fetchRatings(variant.VehicleId)
      if (!detail) continue

      await db.safetyRating.upsert({
        where: { nhtsaVehicleId: variant.VehicleId },
        update: {
          vehicleModelId: vm.id,
          description: detail.VehicleDescription ?? variant.VehicleDescription ?? null,
          overallRating: parseStar(detail.OverallRating),
          frontCrashRating: parseStar(detail.OverallFrontCrashRating),
          sideCrashRating: parseStar(detail.OverallSideCrashRating),
          rolloverRating: parseStar(detail.RolloverRating),
          rolloverRatingText: detail.RolloverRating2 ?? null,
          refreshedAt: new Date(),
        },
        create: {
          nhtsaVehicleId: variant.VehicleId,
          vehicleModelId: vm.id,
          description: detail.VehicleDescription ?? variant.VehicleDescription ?? null,
          overallRating: parseStar(detail.OverallRating),
          frontCrashRating: parseStar(detail.OverallFrontCrashRating),
          sideCrashRating: parseStar(detail.OverallSideCrashRating),
          rolloverRating: parseStar(detail.RolloverRating),
          rolloverRatingText: detail.RolloverRating2 ?? null,
        },
      })
      upserted++
    }

    await report(
      context,
      `[nhtsa-safety-ratings] ${i + 1}/${models.length} — ${vm.year} ${vm.make} ${vm.model}: ${variants.length} variant(s)`,
      { stage: 'fetching', current: i + 1, total: models.length },
    )

    if (i < models.length - 1) await sleep(RATE_LIMIT_MS)
  }

  await report(context, `[nhtsa-safety-ratings] Done. ${upserted} rating(s) upserted across ${models.length} model(s).`, {
    stage: 'complete',
    current: models.length,
    total: models.length,
  })
  await db.$disconnect()
}
