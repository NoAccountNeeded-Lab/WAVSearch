import type { SourceAdapter } from './source-adapter.js'
import type { StructureDetector } from '../ai/structure-detector.js'
import type { ScraperRunRepository, SourceRepository, ListingRepository } from './repositories.js'
import { runGeocodeJob } from '../jobs/geocode.js'
import { report } from '../jobs/job-progress.js'
import type { JobContext } from '@wav-search/queue'

const REMAP_CONFIDENCE_THRESHOLD = 0.7

interface EngineOptions {
  runs: ScraperRunRepository
  sources: SourceRepository
  listings: ListingRepository
  structureDetector: StructureDetector | null
  concurrency?: number
}

export class ScraperEngine {
  private readonly adapters = new Map<string, SourceAdapter>()
  private readonly runs: ScraperRunRepository
  private readonly sources: SourceRepository
  private readonly listings: ListingRepository
  private structureDetector: StructureDetector | null

  constructor(options: EngineOptions) {
    this.runs = options.runs
    this.sources = options.sources
    this.listings = options.listings
    this.structureDetector = options.structureDetector
  }

  setStructureDetector(detector: StructureDetector | null): void {
    this.structureDetector = detector
  }

  // dbSourceId is the DB record's CUID — the key used by all repository methods.
  register(adapter: SourceAdapter, dbSourceId: string): void {
    this.adapters.set(dbSourceId, adapter)
  }

  async runSource(sourceId: string, context?: JobContext): Promise<void> {
    const adapter = this.adapters.get(sourceId)
    if (!adapter) throw new Error(`No adapter registered for source: ${sourceId}`)

    const run = await this.runs.start(sourceId)
    await report(context, `[source-scrape] Started ${adapter.name} (${sourceId})`, {
      stage: 'checking-structure',
      current: 0,
      total: 0,
    })

    try {
      const structureCheck = await adapter.checkStructure()
      const structureSummary = `changed=${structureCheck.changed}, previousHash=${structureCheck.previousHash ?? 'none'}, currentHash=${structureCheck.currentHash}`
      await report(context, `[source-scrape] Structure check complete for ${adapter.name}: ${structureSummary}`, {
        stage: structureCheck.changed ? 'structure-changed' : 'scraping',
        current: 0,
        total: 0,
      })

      if (structureCheck.changed) {
        const detector = this.structureDetector
        if (structureCheck.sampleHtml && detector) {
          const previousMappings = await this.sources.getMappings(sourceId)
          const remap = await detector.remapFields({
            sourceName: adapter.name,
            previousMappings,
            sampleHtml: structureCheck.sampleHtml,
          })
          await this.sources.setMappings(sourceId, remap.mappings)

          if (remap.confidence >= REMAP_CONFIDENCE_THRESHOLD) {
            await report(context, `[source-scrape] Structure changed for ${adapter.name}; AI remapped with confidence ${remap.confidence.toFixed(2)}. Proceeding with scrape.`, {
              stage: 'scraping',
              current: 0,
              total: 0,
            })
            // Fall through: attempt scrape with existing adapter (hardcoded selectors may still work)
          } else {
            const message = `Structure changed — low-confidence remap (${remap.confidence.toFixed(2)}): ${remap.notes}`
            await report(context, `[source-scrape] ${message}. Marked source needs_remapping; scrape skipped.`, {
              stage: 'blocked',
              reason: 'structure_changed_low_confidence_remap',
              current: 0,
              total: 0,
            })
            await this.sources.markNeedsRemapping(sourceId)
            await this.runs.fail(run.id, message)
            return
          }
        } else {
          await report(context, `[source-scrape] Structure changed for ${adapter.name}, but ${structureCheck.sampleHtml ? 'AI remapping is unavailable' : 'no sample HTML was captured'}. Marked source needs_remapping; scrape skipped.`, {
            stage: 'blocked',
            reason: structureCheck.sampleHtml ? 'structure_changed_ai_unavailable' : 'structure_changed_no_sample_html',
            current: 0,
            total: 0,
          })
          await this.sources.markNeedsRemapping(sourceId)
          await this.runs.fail(run.id, 'Structure change detected')
          return
        }
      }

      const result = await adapter.scrape(context)
      await report(context, `[source-scrape] Scraped ${result.listings.length} listing(s) from ${adapter.name}`, {
        stage: 'upserting',
        current: 0,
        total: result.listings.length,
      })

      for (let i = 0; i < result.listings.length; i++) {
        const listing = result.listings[i]!
        await this.listings.upsert({ ...listing, sourceId })
        if ((i + 1) % 25 === 0 || i === result.listings.length - 1) {
          await report(context, `[source-scrape] Upserted ${i + 1}/${result.listings.length} listing(s)`, {
            stage: 'upserting',
            current: i + 1,
            total: result.listings.length,
          })
        }
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
      await report(context, `[source-scrape] Done. ${result.listings.length} listing(s), ${goneCount} marked gone.`, {
        stage: 'complete',
        current: result.listings.length,
        total: result.listings.length,
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
