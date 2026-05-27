import type { SourceAdapter } from './source-adapter.js'
import type { StructureDetector } from '../ai/structure-detector.js'
import type { ScraperRunRepository, SourceRepository, ListingRepository } from './repositories.js'
import { runGeocodeJob } from '../jobs/geocode.js'

const REMAP_CONFIDENCE_THRESHOLD = 0.7

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

  // dbSourceId is the DB record's CUID — the key used by all repository methods.
  register(adapter: SourceAdapter, dbSourceId: string): void {
    this.adapters.set(dbSourceId, adapter)
  }

  async runSource(sourceId: string): Promise<void> {
    const adapter = this.adapters.get(sourceId)
    if (!adapter) throw new Error(`No adapter registered for source: ${sourceId}`)

    const run = await this.runs.start(sourceId)

    try {
      const structureCheck = await adapter.checkStructure()

      if (structureCheck.changed) {
        if (structureCheck.sampleHtml) {
          const previousMappings = await this.sources.getMappings(sourceId)
          const remap = await this.structureDetector.remapFields({
            sourceName: adapter.name,
            previousMappings,
            sampleHtml: structureCheck.sampleHtml,
          })
          await this.sources.setMappings(sourceId, remap.mappings)

          if (remap.confidence >= REMAP_CONFIDENCE_THRESHOLD) {
            console.log(
              `[engine] Structure changed for ${sourceId} — AI remapped with confidence ${remap.confidence.toFixed(2)}. Proceeding with scrape.`
            )
            // Fall through: attempt scrape with existing adapter (hardcoded selectors may still work)
          } else {
            await this.sources.markNeedsRemapping(sourceId)
            await this.runs.fail(run.id, `Structure changed — low-confidence remap (${remap.confidence.toFixed(2)}): ${remap.notes}`)
            return
          }
        } else {
          await this.sources.markNeedsRemapping(sourceId)
          await this.runs.fail(run.id, 'Structure change detected')
          return
        }
      }

      const result = await adapter.scrape()

      for (const listing of result.listings) {
        await this.listings.upsert(listing)
      }

      const activeExternalIds = result.listings
        .map(l => l.externalId)
        .filter((id): id is string => id != null)
      const goneCount = await this.listings.markGone(sourceId, activeExternalIds)
      if (goneCount > 0) {
        console.log(`[engine] Marked ${goneCount} listing(s) as gone for source ${sourceId}`)
      }

      await this.runs.complete(run.id, result.listings.length)
      await this.sources.markActive(sourceId, {
        listingCount: result.listings.length,
        fingerprintHash: result.fingerprintHash,
      })

      runGeocodeJob().catch((err) => {
        console.error('[engine] Geocode job failed (non-fatal):', err)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.runs.fail(run.id, message)
      await this.sources.markError(sourceId, message)
      throw err
    }
  }
}
