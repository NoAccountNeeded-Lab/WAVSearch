export function normalizeVehicleField(s: string | null | undefined): string | null {
  if (!s) return null
  return s.trim().toLowerCase()
}

export type VehicleModelMatchConfidence = 'exact' | 'trim_fallback'
