import type { IntakeFilters } from '@wav-search/types'

// US state abbreviations accepted in the filter
export const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

/**
 * Sanitize and validate a raw AI-returned object into a safe IntakeFilters.
 * Only allows explicitly allowlisted values — silently drops anything unexpected.
 */
export function sanitizeIntakeFilters(raw: unknown): IntakeFilters {
  if (typeof raw !== 'object' || raw === null) return {}

  const obj = raw as Record<string, unknown>
  const filters: IntakeFilters = {}

  const conversionType = obj.conversionType
  if (conversionType === 'rear_entry' || conversionType === 'side_entry') {
    filters.conversionType = conversionType
  }

  const rampType = obj.rampType
  if (rampType === 'in_floor' || rampType === 'fold_out' || rampType === 'fold_in') {
    filters.rampType = rampType
  }

  if (obj.hasLift === true) filters.hasLift = true

  if (obj.handControls === true) filters.handControls = true

  const condition = obj.condition
  if (condition === 'new' || condition === 'used' || condition === 'certified_pre_owned') {
    filters.condition = condition
  }

  const priceMax = obj.priceMax
  if (typeof priceMax === 'number' && Number.isFinite(priceMax) && priceMax > 0 && priceMax <= 500_000) {
    filters.priceMax = Math.round(priceMax)
  }

  const state = obj.state
  if (typeof state === 'string' && US_STATES.has(state.toUpperCase())) {
    filters.state = state.toUpperCase()
  }

  return filters
}
