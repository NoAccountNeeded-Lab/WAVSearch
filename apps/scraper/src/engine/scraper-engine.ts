import type { SourceAdapter } from './source-adapter.js'
import type { StructureDetector } from '../ai/structure-detector.js'
import type { ScraperRunRepository, SourceRepository, ListingRepository } from './repositories.js'

interface EngineOptions {
  runs: ScraperRunRepository
  sources: SourceRepository
  listings: ListingRepository
  structureDetector: StructureDetector
  concurrency?: number
}

export class ScraperEngine {
  private readonly adapters = new Map<string, SourceAdapter>()
  private readonly runs: ScraperRunRepository
  private readonly sources: SourceRepository
  private readonly listings: ListingRepository
  private readonly structureDetector: StructureDetector

  constructor(options: EngineOptions) {
    this.runs = options.runs
    this.sources = options.sources
    this.listings = options.listings
    this.structureDetector = options.structureDetector
  }

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.sourceId, adapter)
  }

  async runSource(sourceId: string): Promise<void> {
    const adapter = this.adapters.get(sourceId)
    if (!adapter) throw new Error(`No adapter registered for source: ${sourceId}`)

    const run = await this.runs.start(sourceId)

    try {
      const structureCheck = await adapter.checkStructure()

      if (structureCheck.changed) {
        await this.sources.markNeedsRemapping(sourceId)
        await this.runs.fail(run.id, 'Structure change detected')
        return
      }

      const result = await adapter.scrape()

      for (const listing of result.listings) {
        await this.listings.upsert(listing)
      }

      await this.runs.complete(run.id, result.listings.length)
      await this.sources.markActive(sourceId, {
        listingCount: result.listings.length,
        fingerprintHash: result.fingerprintHash,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.runs.fail(run.id, message)
      await this.sources.markError(sourceId, message)
      throw err
    }
  }
}
