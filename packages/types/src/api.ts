import type { ListingDetail, ListingPreview } from './listing.js'
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

export type SingleListingResponse = ApiSuccess<ListingDetail>

export type ServiceStatus = 'up' | 'degraded' | 'down' | 'optional_offline'
export type OverallHealthStatus = 'ok' | 'degraded' | 'down'

export interface ServiceHealth {
  status: ServiceStatus
  latencyMs?: number
  lastRunAt?: string
  message?: string
}

export interface HealthResponse {
  status: OverallHealthStatus
  timestamp: string
  services: {
    postgres: ServiceHealth
    meilisearch: ServiceHealth
    valkey: ServiceHealth
    ollama: ServiceHealth
    scraper: ServiceHealth
  }
}
