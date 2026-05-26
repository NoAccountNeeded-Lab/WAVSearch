import type { SourceAdapter, ScrapeResult } from './source-adapter.js'
import type { StructureDetector } from '../ai/structure-detector.js'
import type { getDb } from '@wav-search/db'

interface EngineOptions {
  db: ReturnType<typeof getDb>
  structureDetector: StructureDetector
  concurrency?: number
}

export class ScraperEngine {
  private readonly adapters = new Map<string, SourceAdapter>()
  private readonly db: EngineOptions['db']
  private readonly structureDetector: StructureDetector
  private readonly concurrency: number

  constructor(options: EngineOptions) {
    this.db = options.db
    this.structureDetector = options.structureDetector
    this.concurrency = options.concurrency ?? 2
  }

  register(adapter: SourceAdapter): void {
    this.adapters.set(adapter.sourceId, adapter)
  }

  async runSource(sourceId: string): Promise<void> {
    const adapter = this.adapters.get(sourceId)
    if (!adapter) throw new Error(`No adapter registered for source: ${sourceId}`)

    const run = await this.db.scraperRun.create({
      data: { sourceId, startedAt: new Date() },
    })

    try {
      const structureCheck = await adapter.checkStructure()

      if (structureCheck.changed) {
        await this.db.source.update({
          where: { id: sourceId },
          data: { status: 'needs_remapping', errorMessage: 'Structure changed — awaiting AI remap' },
        })
        await this.db.scraperRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            success: false,
            errorMessage: 'Structure change detected',
          },
        })
        return
      }

      const result = await adapter.scrape()
      await this.persistListings(sourceId, result)

      await this.db.scraperRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          success: true,
          listingsFound: result.listings.length,
        },
      })

      await this.db.source.update({
        where: { id: sourceId },
        data: {
          lastScrapedAt: new Date(),
          listingCount: result.listings.length,
          fingerprintHash: result.fingerprintHash,
          status: 'active',
          errorMessage: null,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.db.scraperRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), success: false, errorMessage: message },
      })
      await this.db.source.update({
        where: { id: sourceId },
        data: { status: 'error', errorMessage: message },
      })
      throw err
    }
  }

  private async persistListings(sourceId: string, result: ScrapeResult): Promise<void> {
    for (const listing of result.listings) {
      await this.db.listing.upsert({
        where: {
          sourceId_externalId: {
            sourceId,
            externalId: listing.externalId ?? '',
          },
        },
        update: {
          priceCents: listing.priceCents,
          mileage: listing.mileage,
          description: listing.description,
          images: listing.images,
          scrapedAt: new Date(),
        },
        create: {
          sourceId,
          sourceUrl: listing.sourceUrl,
          externalId: listing.externalId,
          make: listing.make,
          model: listing.model,
          year: listing.year,
          trim: listing.trim,
          vin: listing.vin,
          condition: listing.condition,
          sellerType: listing.sellerType,
          priceCents: listing.priceCents,
          mileage: listing.mileage,
          color: listing.color,
          fuelType: listing.fuelType,
          transmission: listing.transmission,
          conversionType: listing.wav.conversionType,
          conversionManufacturer: listing.wav.conversionManufacturer,
          floorLoweringInches: listing.wav.floorLoweringInches,
          rampType: listing.wav.rampType,
          hasLift: listing.wav.hasLift,
          handControls: listing.wav.handControls,
          transferSeat: listing.wav.transferSeat,
          wheelchairCapacity: listing.wav.wheelchairCapacity,
          zip: listing.location.zip,
          city: listing.location.city,
          state: listing.location.state,
          lat: listing.location.lat,
          lng: listing.location.lng,
          dealerName: listing.dealer.name,
          dealerPhone: listing.dealer.phone,
          dealerWebsite: listing.dealer.website,
          images: listing.images,
          description: listing.description,
          listedAt: listing.listedAt,
        },
      })
    }
  }
}
