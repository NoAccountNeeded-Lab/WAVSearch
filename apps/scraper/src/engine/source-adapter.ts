import type { Listing } from '@wivwav/types'
import type { JobContext } from '@wivwav/queue'

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

export interface Page1CheckResult {
  currentHash: string
  changed: boolean
}

export interface SourceAdapter {
  readonly sourceId: string
  readonly name: string

  // Optional: hash page 1 listing IDs to skip the full crawl when nothing changed.
  checkPage1?(): Promise<Page1CheckResult>
  checkStructure(): Promise<StructureCheckResult>
  scrape(context?: JobContext): Promise<ScrapeResult>
}
