import type { Listing } from '@wav-search/types'
import type { JobContext } from '@wav-search/queue'

export interface ScrapeResult {
  listings: Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'>[]
  fingerprintHash: string
  errorMessage?: string
}

export interface StructureCheckResult {
  changed: boolean
  currentHash: string
  previousHash: string | null
  sampleHtml?: string  // populated when changed=true, used for AI remapping
}

export interface SourceAdapter {
  readonly sourceId: string
  readonly name: string

  checkStructure(): Promise<StructureCheckResult>
  scrape(context?: JobContext): Promise<ScrapeResult>
}
