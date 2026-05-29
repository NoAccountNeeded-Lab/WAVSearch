import type { MeiliSearch } from 'meilisearch'
import type { Listing, PrismaClient } from '@wav-search/db'

export const INDEX_NAME = 'listings'

export interface ListingDocument {
  id: string
  sourceId: string
  sourceUrl: string
  make: string
  model: string
  year: number
  trim: string | null
  vin: string | null
  condition: string
  sellerType: string
  priceCents: number | null
  priceBucket: string | null
  mileage: number | null
  mileageBucket: string | null
  color: string | null
  fuelType: string | null
  transmission: string | null
  conversionType: string
  conversionManufacturer: string | null
  floorLoweringInches: number | null
  rampType: string
  hasLift: boolean
  handControls: boolean
  transferSeat: boolean
  wheelchairCapacity: number | null
  zip: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  dealerName: string | null
  dealerPhone: string | null
  images: string[]
  description: string | null
  status: string
  listedAt: string
}

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
  await index.updateSettings({
    filterableAttributes: [
      'make', 'model', 'year', 'condition', 'sellerType',
      'conversionType', 'rampType', 'hasLift', 'handControls',
      'transferSeat', 'color', 'state', 'city', 'sourceId',
      'priceCents', 'priceBucket', 'mileage', 'mileageBucket', 'status',
    ],
    sortableAttributes: ['priceCents', 'mileage', 'year', 'listedAt'],
    searchableAttributes: [
      'make', 'model', 'trim', 'description',
      'conversionManufacturer', 'city', 'state',
    ],
  })
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

export function priceBucket(priceCents: number | null, bucketSizeDollars = 5000): string | null {
  if (priceCents == null) return null
  const dollars = priceCents / 100
  const lo = Math.floor(dollars / bucketSizeDollars) * bucketSizeDollars
  return `${lo}-${lo + bucketSizeDollars}`
}

export function mileageBucket(mileage: number | null, bucketSize = 25000): string | null {
  if (mileage == null) return null
  const lo = Math.floor(mileage / bucketSize) * bucketSize
  return `${lo}-${lo + bucketSize}`
}

function toDocument(row: Listing): ListingDocument {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    make: row.make,
    model: row.model,
    year: row.year,
    trim: row.trim,
    vin: row.vin,
    condition: row.condition,
    sellerType: row.sellerType,
    priceCents: row.priceCents,
    priceBucket: priceBucket(row.priceCents),
    mileage: row.mileage,
    mileageBucket: mileageBucket(row.mileage),
    color: row.color,
    fuelType: row.fuelType,
    transmission: row.transmission,
    conversionType: row.conversionType,
    conversionManufacturer: row.conversionManufacturer,
    floorLoweringInches: row.floorLoweringInches,
    rampType: row.rampType,
    hasLift: row.hasLift,
    handControls: row.handControls,
    transferSeat: row.transferSeat,
    wheelchairCapacity: row.wheelchairCapacity,
    zip: row.zip,
    city: row.city,
    state: row.state,
    lat: row.lat,
    lng: row.lng,
    dealerName: row.dealerName,
    dealerPhone: row.dealerPhone,
    images: row.images,
    description: row.description,
    status: row.status,
    listedAt: row.listedAt.toISOString(),
  }
}
