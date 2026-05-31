import { getDb } from '@wav-search/db'
import type { JobContext } from '@wav-search/queue'
import { report } from './job-progress.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1100 // Nominatim policy: max 1 req/sec

interface NominatimResult {
  lat: string
  lon: string
}

async function geocode(city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    q: `${city}, ${state}, USA`,
    format: 'json',
    limit: '1',
  })

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': 'WAVSearch/1.0 (wav-search.com)' },
  })

  if (!res.ok) return null

  const results: NominatimResult[] = await res.json()
  if (results.length === 0) return null

  return { lat: parseFloat(results[0]!.lat), lng: parseFloat(results[0]!.lon) }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runGeocodeJob(context?: JobContext): Promise<void> {
  const db = getDb()

  const listings = await db.listing.findMany({
    where: { lat: null, city: { not: null }, state: { not: null } },
    select: { id: true, city: true, state: true },
  })

  // Group by unique city+state — one Nominatim call per location, not per listing.
  // Many listings share a city (e.g. 200 listings in "Tampa, FL") so this can
  // reduce requests by 10-50x compared to geocoding each row individually.
  const byLocation = new Map<string, string[]>()
  for (const l of listings) {
    const key = `${l.city}|${l.state}`
    const ids = byLocation.get(key) ?? []
    ids.push(l.id)
    byLocation.set(key, ids)
  }

  const uniquePairs = [...byLocation.entries()]

  await report(context, `[geocode] ${listings.length} listing(s) → ${uniquePairs.length} unique location(s) to look up`, {
    stage: 'geocoding',
    current: 0,
    total: uniquePairs.length,
  })

  let successListings = 0
  let failedListings = 0

  for (let i = 0; i < uniquePairs.length; i++) {
    const [key, ids] = uniquePairs[i]!
    const [city, state] = key.split('|') as [string, string]

    const coords = await geocode(city, state)

    if (coords) {
      await db.listing.updateMany({
        where: { id: { in: ids } },
        data: { lat: coords.lat, lng: coords.lng },
      })
      successListings += ids.length
    } else {
      failedListings += ids.length
    }

    await report(
      context,
      `[geocode] ${i + 1}/${uniquePairs.length} locations — ${city}, ${state} → ${coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'not found'} (${ids.length} listing(s))`,
      { stage: 'geocoding', current: i + 1, total: uniquePairs.length },
    )

    if (i < uniquePairs.length - 1) {
      await sleep(RATE_LIMIT_MS)
    }
  }

  await report(context, `[geocode] Done. ${successListings} geocoded, ${failedListings} failed.`, {
    stage: 'complete',
    current: uniquePairs.length,
    total: uniquePairs.length,
  })
  await db.$disconnect()
}
