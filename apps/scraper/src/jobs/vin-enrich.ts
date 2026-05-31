import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import { report } from './job-progress.js'

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin'
const RATE_LIMIT_MS = 200

interface VpicResult {
  Variable: string
  Value: string | null
}

interface VpicResponse {
  Results: VpicResult[]
}

function getValue(results: VpicResult[], variable: string): string | null {
  const r = results.find((r) => r.Variable === variable)
  const v = r?.Value?.trim()
  return v && v !== 'Not Applicable' ? v : null
}

async function decodeVin(
  vin: string,
): Promise<{ make: string; model: string; year: number; trim: string | null; bodyType: string | null } | null> {
  const res = await fetch(`${VPIC_URL}/${encodeURIComponent(vin)}?format=json`, {
    headers: { 'User-Agent': 'WAVSearch/1.0 (wav-search.com)' },
  })
  if (!res.ok) return null

  const data: VpicResponse = await res.json()
  const make = getValue(data.Results, 'Make')
  const model = getValue(data.Results, 'Model')
  const yearStr = getValue(data.Results, 'Model Year')
  const year = yearStr ? parseInt(yearStr) : NaN

  if (!make || !model || isNaN(year)) return null

  return {
    make,
    model,
    year,
    trim: getValue(data.Results, 'Trim'),
    bodyType: getValue(data.Results, 'Body Class'),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runVinEnrichJob(context?: JobContext): Promise<void> {
  const db = getDb()

  const listings = await db.listing.findMany({
    where: { vin: { not: null }, vehicleModelId: null },
    select: { id: true, vin: true },
  })

  await report(context, `[vin-enrich] ${listings.length} listing(s) need VIN decode`, {
    stage: 'decoding',
    current: 0,
    total: listings.length,
  })

  let enriched = 0
  let failed = 0

  for (let i = 0; i < listings.length; i++) {
    const { id, vin } = listings[i]!

    const decoded = await decodeVin(vin!)

    if (decoded) {
      let vehicleModel = await db.vehicleModel.findFirst({
        where: { make: decoded.make, model: decoded.model, year: decoded.year, trim: decoded.trim },
      })

      if (!vehicleModel) {
        vehicleModel = await db.vehicleModel.create({
          data: { make: decoded.make, model: decoded.model, year: decoded.year, trim: decoded.trim, bodyType: decoded.bodyType },
        })
      } else if (decoded.bodyType && !vehicleModel.bodyType) {
        vehicleModel = await db.vehicleModel.update({
          where: { id: vehicleModel.id },
          data: { bodyType: decoded.bodyType },
        })
      }

      await db.listing.update({ where: { id }, data: { vehicleModelId: vehicleModel.id } })
      enriched++
    } else {
      failed++
    }

    await report(
      context,
      `[vin-enrich] ${i + 1}/${listings.length} — ${vin} → ${decoded ? `${decoded.make} ${decoded.model} ${decoded.year}` : 'decode failed'}`,
      { stage: 'decoding', current: i + 1, total: listings.length },
    )

    if (i < listings.length - 1) await sleep(RATE_LIMIT_MS)
  }

  await report(context, `[vin-enrich] Done. ${enriched} enriched, ${failed} failed.`, {
    stage: 'complete',
    current: listings.length,
    total: listings.length,
  })
  await db.$disconnect()
}
