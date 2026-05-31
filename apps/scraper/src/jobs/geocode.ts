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

  await report(context, `[geocode] Geocoding ${listings.length} listing(s)`, {
    stage: 'geocoding',
    current: 0,
    total: listings.length,
  })

  let success = 0
  let failed = 0

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]!
    const coords = await geocode(listing.city!, listing.state!)

    if (coords) {
      await db.listing.update({
        where: { id: listing.id },
        data: { lat: coords.lat, lng: coords.lng },
      })
      success++
    } else {
      failed++
    }

    await report(context, `[geocode] Processed ${i + 1}/${listings.length} listing(s)`, {
      stage: 'geocoding',
      current: i + 1,
      total: listings.length,
    })

    if (i < listings.length - 1) {
      await sleep(RATE_LIMIT_MS)
    }
  }

  await report(context, `[geocode] Done. ${success} geocoded, ${failed} failed.`, {
    stage: 'complete',
    current: listings.length,
    total: listings.length,
  })
  await db.$disconnect()
}
