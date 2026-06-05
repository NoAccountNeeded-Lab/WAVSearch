/**
 * Model research job — fetches cited vehicle spec data from the EPA FuelEconomy.gov
 * API and stores claims with source URLs for display on listing detail pages.
 *
 * Source:
 *   - EPA FuelEconomy.gov API (public, no key required, MIT-friendly terms)
 *
 * Claims stored per vehicle model (all sourced from EPA):
 *   - engineDescription  — engine displacement + cylinder count, or eng_dscr string
 *   - drivetrain         — e.g. "Front-Wheel Drive"
 *   - fuelEconomyCity    — city MPG
 *   - fuelEconomyHwy     — highway MPG
 *   - fuelEconomyCombined — combined MPG
 *   - fuelType           — e.g. "Regular Gasoline"
 *   - transmission       — e.g. "Automatic 8-spd"
 *
 * Future: add MSRP, horsepower from additional sources (see issue #133 follow-up).
 */

import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import { report } from './job-progress.js'

const RESEARCH_VERSION = 1
const RATE_LIMIT_MS = 300

const EPA_SOURCE_NAME = 'EPA FuelEconomy.gov'
const EPA_SOURCE_URL_BASE = 'https://www.fueleconomy.gov/feg/bymodel'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── EPA FuelEconomy.gov ───────────────────────────────────────────────────────

interface EpaVehicle {
  id: number
  make: string
  model: string
  year: number
  trany?: string
  drive?: string
  displ?: number
  cylinders?: number
  pv4?: number   // combined MPG (petroleum vehicles)
  city08?: number
  hwy08?: number
  combMpgData?: number
  cityMpgData?: number
  hwyMpgData?: number
  fuelType?: string
  eng_dscr?: string
}

interface EpaVehiclesResponse {
  vehicle?: EpaVehicle[]
}

async function fetchEpaData(make: string, model: string, year: number): Promise<EpaVehicle | null> {
  try {
    const params = new URLSearchParams({ make, model, year: String(year), format: 'json' })
    const url = `https://www.fueleconomy.gov/ws/rest/ympg/shared/vehicles?${params}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WAVSearch/1.0 (wav-search.com)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as EpaVehiclesResponse
    const vehicles = data.vehicle ?? []
    if (vehicles.length === 0) return null
    // Prefer the first result; EPA sometimes returns multiple trims
    return vehicles[0] ?? null
  } catch {
    return null
  }
}

// ── Claim builder ─────────────────────────────────────────────────────────────

interface ClaimInput {
  field: string
  claimText: string
  confidence: 'high' | 'medium' | 'low'
  sourceId: string
}

function buildEpaClaims(epa: EpaVehicle, epaSourceId: string): ClaimInput[] {
  const claims: ClaimInput[] = []

  if (epa.city08 && epa.city08 > 0) {
    claims.push({
      field: 'fuelEconomyCity',
      claimText: `${epa.city08} MPG city`,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  if (epa.hwy08 && epa.hwy08 > 0) {
    claims.push({
      field: 'fuelEconomyHwy',
      claimText: `${epa.hwy08} MPG highway`,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  const combined = epa.combMpgData ?? epa.pv4
  if (combined && combined > 0) {
    claims.push({
      field: 'fuelEconomyCombined',
      claimText: `${combined} MPG combined`,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  if (epa.drive) {
    claims.push({
      field: 'drivetrain',
      claimText: epa.drive,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  if (epa.eng_dscr) {
    claims.push({
      field: 'engineDescription',
      claimText: epa.eng_dscr,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  } else if (epa.displ && epa.cylinders) {
    claims.push({
      field: 'engineDescription',
      claimText: `${epa.displ}L ${epa.cylinders}-cylinder`,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  if (epa.fuelType) {
    claims.push({
      field: 'fuelType',
      claimText: epa.fuelType,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  if (epa.trany) {
    claims.push({
      field: 'transmission',
      claimText: epa.trany,
      confidence: 'high',
      sourceId: epaSourceId,
    })
  }

  return claims
}

// ── Main job ──────────────────────────────────────────────────────────────────

export async function runModelResearchJob(context?: JobContext): Promise<void> {
  const db = getDb()

  const models = await db.vehicleModel.findMany({
    select: { id: true, make: true, model: true, year: true },
  })

  await report(context, `[model-research] ${models.length} vehicle model(s) to research`, {
    stage: 'starting',
    current: 0,
    total: models.length,
  })

  let researched = 0
  let skipped = 0

  for (let i = 0; i < models.length; i++) {
    const vm = models[i]!

    // Skip if already at RESEARCH_VERSION. To force a re-run, bump the constant
    // and redeploy — there is no on-demand refresh for already-processed models.
    const existing = await db.vehicleModelResearch.findFirst({
      where: { vehicleModelId: vm.id, researchVersion: RESEARCH_VERSION },
      select: { id: true },
    })

    if (existing) {
      skipped++
      await report(
        context,
        `[model-research] ${i + 1}/${models.length} — ${vm.year} ${vm.make} ${vm.model}: already at v${RESEARCH_VERSION}, skipping`,
        { stage: 'processing', current: i + 1, total: models.length },
      )
      continue
    }

    // Fetch EPA fuel economy data
    const epaData = await fetchEpaData(vm.make, vm.model, vm.year)

    // Require EPA data to be worth storing a research record
    if (!epaData) {
      await report(
        context,
        `[model-research] ${i + 1}/${models.length} — ${vm.year} ${vm.make} ${vm.model}: no EPA data found`,
        { stage: 'processing', current: i + 1, total: models.length },
      )
      if (i < models.length - 1) await sleep(RATE_LIMIT_MS)
      continue
    }

    // EPA source URL for the model year page; fueleconomy.gov uses underscores, not %20
    const epaUrl = `${EPA_SOURCE_URL_BASE}/${vm.year}_${vm.make.replace(/ /g, '_')}_${vm.model.replace(/ /g, '_')}.shtml`

    // Create research record with EPA source entry
    const research = await db.vehicleModelResearch.create({
      data: {
        vehicleModelId: vm.id,
        researchVersion: RESEARCH_VERSION,
        researchedAt: new Date(),
        sources: {
          create: [
            { sourceName: EPA_SOURCE_NAME, sourceUrl: epaUrl, fetchedAt: new Date() },
          ],
        },
      },
      include: {
        sources: { select: { id: true, sourceName: true } },
      },
    })

    // Attach EPA claims to the EPA source record
    const claimInputs: Array<{ researchId: string; field: string; claimText: string; confidence: string; sourceId: string | null }> = []

    const epaSource = research.sources.find((s) => s.sourceName === EPA_SOURCE_NAME)
    if (epaSource) {
      const epaClaims = buildEpaClaims(epaData, epaSource.id)
      for (const c of epaClaims) {
        claimInputs.push({
          researchId: research.id,
          field: c.field,
          claimText: c.claimText,
          confidence: c.confidence,
          sourceId: c.sourceId,
        })
      }
    }

    if (claimInputs.length > 0) {
      await db.vehicleModelClaim.createMany({ data: claimInputs })
    }

    researched++

    await report(
      context,
      `[model-research] ${i + 1}/${models.length} — ${vm.year} ${vm.make} ${vm.model}: ${claimInputs.length} claim(s) stored`,
      { stage: 'processing', current: i + 1, total: models.length },
    )

    if (i < models.length - 1) await sleep(RATE_LIMIT_MS)
  }

  await report(
    context,
    `[model-research] Done. ${researched} model(s) researched, ${skipped} skipped (already at v${RESEARCH_VERSION}).`,
    { stage: 'complete', current: models.length, total: models.length },
  )
  await db.$disconnect()
}
