import type { Listing, FieldMapping } from '@wav-search/types'

export interface ScraperRunRecord {
  id: string
}

export interface ScraperRunRepository {
  start(sourceId: string): Promise<ScraperRunRecord>
  complete(id: string, listingsFound: number): Promise<void>
  fail(id: string, errorMessage: string): Promise<void>
}

export interface SourceRepository {
  markNeedsRemapping(id: string): Promise<void>
  markActive(id: string, data: { listingCount: number; fingerprintHash: string; page1Hash?: string }): Promise<void>
  markError(id: string, errorMessage: string): Promise<void>
  getMappings(id: string): Promise<FieldMapping[]>
  setMappings(id: string, mappings: FieldMapping[]): Promise<void>
}

export type ListingUpsertData = Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'>

export interface PriceHistoryRow {
  id: string
  listingId: string
  priceCents: number
  recordedAt: Date
}

export interface ListingRepository {
  upsert(listing: ListingUpsertData): Promise<void>
  markGone(sourceId: string, activeExternalIds: string[]): Promise<number>
}
