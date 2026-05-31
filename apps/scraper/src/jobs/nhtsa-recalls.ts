import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import { report } from './job-progress.js'

const RECALLS_URL = 'https://api.nhtsa.gov/recalls/recallsByVehicle'
const RATE_LIMIT_MS = 300

interface NhtsaRecall {
  NHTSACampaignNumber: string
  Component: string
  Summary: string
  Remedy?: string | null
  ReportReceivedDate?: string | null
}

interface RecallsResponse {
  results?: NhtsaRecall[]
}

function parseMicrosoftDate(val: string | null | undefined): Date {
  if (!val) return new Date(0)
  const m = /\/Date\((\d+)\)\//.exec(val)
  return m && m[1] ? new Date(Number(m[1])) : new Date(0)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchRecalls(make: string, model: string, year: number): Promise<NhtsaRecall[]> {
  const params = new URLSearchParams({ make, model, modelYear: String(year) })
  const res = await fetch(`${RECALLS_URL}?${params}`, {
    headers: { 'User-Agent': 'WAVSearch/1.0 (wav-search.com)' },
  })
  if (!res.ok) return []
  const data: RecallsResponse = await res.json()
  return data.results ?? []
}

export async function runNhtsaRecallsJob(context?: JobContext): Promise<void> {
  const db = getDb()

  const models = await db.vehicleModel.findMany({
    select: { id: true, make: true, model: true, year: true },
  })

  await report(context, `[nhtsa-recalls] ${models.length} vehicle model(s) to refresh`, {
    stage: 'fetching',
    current: 0,
    total: models.length,
  })

  let upserted = 0

  for (let i = 0; i < models.length; i++) {
    const vm = models[i]!
    const recalls = await fetchRecalls(vm.make, vm.model, vm.year)

    for (const recall of recalls) {
      if (!recall.NHTSACampaignNumber) continue

      await db.recall.upsert({
        where: {
          nhtsaCampaignId_vehicleModelId: {
            nhtsaCampaignId: recall.NHTSACampaignNumber,
            vehicleModelId: vm.id,
          },
        },
        update: {
          component: recall.Component,
          summary: recall.Summary,
          remedy: recall.Remedy ?? null,
          reportedAt: parseMicrosoftDate(recall.ReportReceivedDate),
        },
        create: {
          nhtsaCampaignId: recall.NHTSACampaignNumber,
          vehicleModelId: vm.id,
          component: recall.Component,
          summary: recall.Summary,
          remedy: recall.Remedy ?? null,
          reportedAt: parseMicrosoftDate(recall.ReportReceivedDate),
        },
      })
      upserted++
    }

    await report(
      context,
      `[nhtsa-recalls] ${i + 1}/${models.length} — ${vm.year} ${vm.make} ${vm.model}: ${recalls.length} recall(s)`,
      { stage: 'fetching', current: i + 1, total: models.length },
    )

    if (i < models.length - 1) await sleep(RATE_LIMIT_MS)
  }

  await report(context, `[nhtsa-recalls] Done. ${upserted} recall(s) upserted across ${models.length} model(s).`, {
    stage: 'complete',
    current: models.length,
    total: models.length,
  })
  await db.$disconnect()
}
