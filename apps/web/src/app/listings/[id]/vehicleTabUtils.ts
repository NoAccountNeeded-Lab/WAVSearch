import type { VehicleStats } from './types.js'

export function deriveVisibleVehicleStats(
  vehicleStats: VehicleStats | null,
): { label: string; value: string }[] {
  return [
    vehicleStats?.avgLifespanMiles !== null && vehicleStats?.avgLifespanMiles !== undefined
      ? {
          label: 'Average lifespan',
          value: `${vehicleStats.avgLifespanMiles.toLocaleString()} miles`,
        }
      : null,
    vehicleStats?.reliabilityScore !== null && vehicleStats?.reliabilityScore !== undefined
      ? { label: 'Reliability score', value: String(vehicleStats.reliabilityScore) }
      : null,
    vehicleStats?.jdPowerScore !== null && vehicleStats?.jdPowerScore !== undefined
      ? { label: 'J.D. Power score', value: String(vehicleStats.jdPowerScore) }
      : null,
  ].filter((stat): stat is { label: string; value: string } => stat !== null)
}

export function deriveShowVehicleStats(vehicleStats: VehicleStats | null): boolean {
  return (
    vehicleStats !== null &&
    (deriveVisibleVehicleStats(vehicleStats).length > 0 ||
      Boolean(vehicleStats.methodology) ||
      vehicleStats.sources.length > 0)
  )
}
