const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin'

interface VpicResult {
  Variable: string
  Value: string | null
}

interface VpicResponse {
  Results: VpicResult[]
}

export interface DecodedVin {
  make: string
  model: string
  year: number
  trim: string | null
  bodyType: string | null
}

function getValue(results: VpicResult[], variable: string): string | null {
  const result = results.find((r) => r.Variable === variable)
  const value = result?.Value?.trim()
  return value && value !== 'Not Applicable' ? value : null
}

export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase()
}

export function isValidVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(vin))
}

export async function decodeVin(normalizedVin: string): Promise<DecodedVin | null> {
  let res: Response
  try {
    res = await fetch(`${VPIC_URL}/${encodeURIComponent(normalizedVin)}?format=json`, {
      headers: { 'User-Agent': 'WivWav/1.0 (wivwav.com)' },
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  const data = (await res.json()) as VpicResponse
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
