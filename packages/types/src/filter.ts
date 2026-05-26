import type { ConversionType, ListingCondition, ListingSellerType, RampType } from './listing.js'

export interface RangeFilter<T> {
  min: T | null
  max: T | null
}

export interface ListingFilters {
  query: string | null
  makes: string[]
  models: string[]
  years: RangeFilter<number>
  priceCents: RangeFilter<number>
  mileage: RangeFilter<number>
  conditions: ListingCondition[]
  sellerTypes: ListingSellerType[]
  states: string[]
  conversionTypes: ConversionType[]
  conversionManufacturers: string[]
  rampTypes: RampType[]
  hasLift: boolean | null
  handControls: boolean | null
  sourceIds: string[]
}

export type ListingSortField = 'price' | 'year' | 'mileage' | 'listedAt'
export type SortDirection = 'asc' | 'desc'

export interface ListingSort {
  field: ListingSortField
  direction: SortDirection
}

export interface PaginationParams {
  page: number
  perPage: number
}

export interface FacetCount {
  value: string
  count: number
}

export interface PriceBucket {
  minCents: number
  maxCents: number
  count: number
}

export interface ListingAggregations {
  total: number
  priceBuckets: PriceBucket[]
  yearCounts: FacetCount[]
  makeCounts: FacetCount[]
  conditionCounts: FacetCount[]
  sellerTypeCounts: FacetCount[]
  conversionTypeCounts: FacetCount[]
  stateCounts: FacetCount[]
}
