import type { Listing, ListingPreview } from './listing.js'
import type { ListingAggregations, ListingFilters, ListingSort, PaginationParams } from './filter.js'

export interface ApiSuccess<T> {
  data: T
  meta?: Record<string, unknown>
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

export interface ListingsSearchRequest {
  filters: Partial<ListingFilters>
  sort: ListingSort
  pagination: PaginationParams
}

export interface ListingsSearchResponse {
  listings: ListingPreview[]
  aggregations: ListingAggregations
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export type SingleListingResponse = ApiSuccess<Listing>
