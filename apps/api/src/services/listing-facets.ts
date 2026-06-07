import type { Meilisearch } from 'meilisearch'
import type { Redis } from 'ioredis'
import { INDEX_NAME, q } from './listing-search.js'
import type { SearchParams } from './listing-search.js'

export type FacetsParams = Omit<SearchParams, 'page' | 'perPage' | 'sort'>

export interface FacetsResult {
  total: number
  priceDistribution: Array<{ bucket: string; count: number }>
  yearDistribution: Array<{ year: number; count: number }>
  mileageDistribution: Array<{ bucket: string; count: number }>
  makeBreakdown: Array<{ value: string; count: number }>
  modelBreakdown: Array<{ value: string; count: number }>
  stateBreakdown: Array<{ value: string; count: number }>
  conditionBreakdown: Array<{ value: string; count: number }>
  conversionBreakdown: Array<{ value: string; count: number }>
  colorBreakdown: Array<{ value: string; count: number }>
  wavFeatures: {
    hasLift: number
    handControls: number
    rampTypes: Array<{ value: string; count: number }>
  }
}

const CACHE_TTL_SECONDS = 60

export class ListingFacetsService {
  private readonly index

  constructor(
    private readonly client: Meilisearch,
    private readonly cache: Redis,
  ) {
    this.index = client.index(INDEX_NAME)
  }

  async getFacets(params: FacetsParams): Promise<FacetsResult> {
    const cacheKey = `facets:${stableKey(params)}`

    const cached = await this.cache.get(cacheKey).catch(() => null)
    if (cached) return JSON.parse(cached) as FacetsResult

    const filters: string[] = ['status = "active"']

    if (params.make?.length) filters.push(`make IN [${params.make.map(q).join(', ')}]`)
    if (params.model?.length) filters.push(`model IN [${params.model.map(q).join(', ')}]`)
    if (params.yearMin != null) filters.push(`year >= ${params.yearMin}`)
    if (params.yearMax != null) filters.push(`year <= ${params.yearMax}`)
    if (params.priceMin != null) filters.push(`priceCents >= ${params.priceMin}`)
    if (params.priceMax != null) filters.push(`priceCents <= ${params.priceMax}`)
    if (params.mileageMax != null) filters.push(`mileage <= ${params.mileageMax}`)
    if (params.condition?.length) filters.push(`condition IN [${params.condition.map(q).join(', ')}]`)
    if (params.conversionType?.length) filters.push(`conversionType IN [${params.conversionType.map(q).join(', ')}]`)
    if (params.rampType?.length) filters.push(`rampType IN [${params.rampType.map(q).join(', ')}]`)
    if (params.hasLift != null) filters.push(`hasLift = ${params.hasLift}`)
    if (params.handControls != null) filters.push(`handControls = ${params.handControls}`)
    if (params.color?.length) filters.push(`color IN [${params.color.map(q).join(', ')}]`)
    if (params.state?.length) filters.push(`state IN [${params.state.map(q).join(', ')}]`)

    const result = await this.index.search(params.q ?? '', {
      filter: filters.join(' AND '),
      facets: [
        'make', 'model', 'year', 'condition', 'conversionType',
        'rampType', 'hasLift', 'handControls', 'color', 'state',
        'priceBucket', 'mileageBucket',
      ],
      limit: 0,
    })

    const dist = result.facetDistribution ?? {}

    const facetsResult: FacetsResult = {
      total: result.estimatedTotalHits ?? 0,
      priceDistribution: toSortedBuckets(dist['priceBucket'] ?? {}),
      yearDistribution: toYearDist(dist['year'] ?? {}),
      mileageDistribution: toSortedBuckets(dist['mileageBucket'] ?? {}),
      makeBreakdown: toValueCount(dist['make'] ?? {}),
      modelBreakdown: toValueCount(dist['model'] ?? {}),
      stateBreakdown: toValueCount(dist['state'] ?? {}),
      conditionBreakdown: toValueCount(dist['condition'] ?? {}),
      conversionBreakdown: toValueCount(dist['conversionType'] ?? {}),
      colorBreakdown: toValueCount(dist['color'] ?? {}),
      wavFeatures: {
        hasLift: (dist['hasLift'] ?? {})['true'] ?? 0,
        handControls: (dist['handControls'] ?? {})['true'] ?? 0,
        rampTypes: toValueCount(dist['rampType'] ?? {}),
      },
    }

    await this.cache
      .setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(facetsResult))
      .catch(() => {})

    return facetsResult
  }
}

// Sort keys and array values so property insertion order doesn't affect the cache key.
function stableKey(params: FacetsParams): string {
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(params).sort()) {
    const v = (params as Record<string, unknown>)[k]
    sorted[k] = Array.isArray(v) ? [...v].sort() : v
  }
  return JSON.stringify(sorted)
}

function toValueCount(dist: Record<string, number>): Array<{ value: string; count: number }> {
  return Object.entries(dist)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

function toYearDist(dist: Record<string, number>): Array<{ year: number; count: number }> {
  return Object.entries(dist)
    .map(([year, count]) => ({ year: parseInt(year, 10), count }))
    .sort((a, b) => a.year - b.year)
}

// Buckets are stored as "lo-hi" strings. Sort by numeric lo value.
function toSortedBuckets(dist: Record<string, number>): Array<{ bucket: string; count: number }> {
  return Object.entries(dist)
    .map(([bucket, count]) => ({ bucket, count, lo: parseInt(bucket.split('-')[0] ?? '0', 10) }))
    .sort((a, b) => a.lo - b.lo)
    .map(({ bucket, count }) => ({ bucket, count }))
}
