import type { MeiliSearch } from 'meilisearch'
import type { PrismaClient } from '@wivwav/db'
import type { ListingDocument } from '@wivwav/search'
import {
  INDEX_NAME,
  toDocument,
} from '@wivwav/search'

export { INDEX_NAME, priceBucket, mileageBucket } from '@wivwav/search'
export type { ListingDocument } from '@wivwav/search'

export interface SearchParams {
  q?: string | undefined
  page?: number | undefined
  perPage?: number | undefined
  make?: string[] | undefined
  model?: string[] | undefined
  yearMin?: number | undefined
  yearMax?: number | undefined
  priceMin?: number | undefined
  priceMax?: number | undefined
  mileageMax?: number | undefined
  condition?: string[] | undefined
  conversionType?: string[] | undefined
  rampType?: string[] | undefined
  hasLift?: boolean | undefined
  handControls?: boolean | undefined
  color?: string[] | undefined
  state?: string[] | undefined
  sort?: string | undefined
}

export interface SearchResult {
  hits: ListingDocument[]
  total: number
  facets: Record<string, Record<string, number>>
}

const BATCH_SIZE = 1000

export async function configureListingsIndex(client: MeiliSearch): Promise<void> {
  const index = client.index(INDEX_NAME)
  const task = await index.updateSettings({
    filterableAttributes: [
      'make', 'model', 'year', 'condition', 'sellerType',
      'conversionType', 'rampType', 'hasLift', 'handControls',
      'transferSeat', 'color', 'state', 'city', 'sourceId',
      'priceCents', 'priceBucket', 'mileage', 'mileageBucket', 'status', 'saleStatus',
    ],
    sortableAttributes: ['priceCents', 'mileage', 'year', 'listedAt'],
    pagination: { maxTotalHits: 20000 },
    searchableAttributes: [
      'make', 'model', 'trim', 'description',
      'conversionManufacturer', 'city', 'state',
    ],
  })
  // Wait for Meilisearch to finish applying settings before the server opens.
  // updateSettings only enqueues a task; without this the index may still have
  // stale attributes when the first request arrives after a fresh deployment.
  await client.waitForTask(task.taskUid, { timeOutMs: 15_000 })
}

export class ListingSearchService {
  private readonly index

  constructor(private readonly client: MeiliSearch) {
    this.index = client.index<ListingDocument>(INDEX_NAME)
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const page = params.page ?? 1
    const perPage = params.perPage ?? 20
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
      ...(filters.length ? { filter: filters.join(' AND ') } : {}),
      facets: ['make', 'model', 'year', 'condition', 'conversionType', 'rampType', 'color', 'state'],
      offset: (page - 1) * perPage,
      limit: perPage,
      ...(params.sort ? { sort: [params.sort] } : {}),
    })

    return {
      hits: result.hits,
      total: result.estimatedTotalHits ?? 0,
      facets: (result.facetDistribution ?? {}) as Record<string, Record<string, number>>,
    }
  }

  async syncAll(db: PrismaClient): Promise<number> {
    let synced = 0
    let cursor: string | undefined

    for (;;) {
      const rows = await db.listing.findMany({
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      })
      if (rows.length === 0) break

      await this.index.addDocuments(rows.map(toDocument), { primaryKey: 'id' })
      synced += rows.length
      cursor = rows[rows.length - 1]!.id
      if (rows.length < BATCH_SIZE) break
    }

    return synced
  }
}

export function q(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
