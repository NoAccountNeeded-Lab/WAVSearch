import type { ConversionType, ListingCondition, RampType } from './listing.js'

export interface IntakeRequest {
  description: string
}

export interface IntakeFilters {
  conversionType?: ConversionType
  rampType?: RampType
  hasLift?: boolean
  handControls?: boolean
  condition?: ListingCondition
  priceMax?: number
  state?: string
}

export interface IntakeResponse {
  filters: IntakeFilters
}
