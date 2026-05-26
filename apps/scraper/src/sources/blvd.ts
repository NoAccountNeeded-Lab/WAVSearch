import { createHash } from 'crypto'
import type { SourceAdapter, ScrapeResult, StructureCheckResult } from '../engine/source-adapter.js'
import type { Listing } from '@wav-search/types'

const SOURCE_ID = 'blvd'
const BASE_URL = 'https://www.blvd.com'

export class BlvdAdapter implements SourceAdapter {
  readonly sourceId = SOURCE_ID
  readonly name = 'BLVD.com'

  private previousHash: string | null

  constructor(previousHash: string | null = null) {
    this.previousHash = previousHash
  }

  async checkStructure(): Promise<StructureCheckResult> {
    // Fetch a sample listing page and hash its key structural elements
    // Playwright browser is shared per-run via the engine in production
    // This stub returns unchanged to unblock development
    const currentHash = this.previousHash ?? 'initial'
    return {
      changed: false,
      currentHash,
      previousHash: this.previousHash,
    }
  }

  async scrape(): Promise<ScrapeResult> {
    // TODO: implement full Playwright scrape of blvd.com/wheelchair-vans-for-sale
    // Paginate through all state pages, extract listing cards, follow to detail pages
    const listings: Omit<Listing, 'id' | 'scrapedAt' | 'updatedAt'>[] = []
    const fingerprintHash = createHash('sha256').update(BASE_URL).digest('hex')

    return { listings, fingerprintHash }
  }
}
