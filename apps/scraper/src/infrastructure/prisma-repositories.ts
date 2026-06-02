import type { PrismaClient } from '@wav-search/db'
import type { FieldMapping } from '@wav-search/types'
import type {
  ScraperRunRepository,
  ScraperRunRecord,
  SourceRepository,
  ListingRepository,
  ListingUpsertData,
} from '../engine/repositories.js'

export class PrismaScraperRunRepository implements ScraperRunRepository {
  constructor(private readonly db: PrismaClient) {}

  async start(sourceId: string): Promise<ScraperRunRecord> {
    return this.db.scraperRun.create({ data: { sourceId, startedAt: new Date() } })
  }

  async complete(id: string, listingsFound: number): Promise<void> {
    await this.db.scraperRun.update({
      where: { id },
      data: { finishedAt: new Date(), success: true, listingsFound },
    })
  }

  async fail(id: string, errorMessage: string): Promise<void> {
    await this.db.scraperRun.update({
      where: { id },
      data: { finishedAt: new Date(), success: false, errorMessage },
    })
  }
}

export class PrismaSourceRepository implements SourceRepository {
  constructor(private readonly db: PrismaClient) {}

  async markNeedsRemapping(id: string): Promise<void> {
    await this.db.source.update({
      where: { id },
      data: { status: 'needs_remapping', errorMessage: 'Structure changed — awaiting AI remap' },
    })
  }

  async markActive(id: string, data: { listingCount: number; fingerprintHash: string; page1Hash?: string }): Promise<void> {
    await this.db.source.update({
      where: { id },
      data: {
        lastScrapedAt: new Date(),
        listingCount: data.listingCount,
        fingerprintHash: data.fingerprintHash,
        ...(data.page1Hash !== undefined ? { page1Hash: data.page1Hash } : {}),
        status: 'active',
        errorMessage: null,
      },
    })
  }

  async markError(id: string, errorMessage: string): Promise<void> {
    await this.db.source.update({
      where: { id },
      data: { status: 'error', errorMessage },
    })
  }

  async getMappings(id: string): Promise<FieldMapping[]> {
    const source = await this.db.source.findUnique({ where: { id }, select: { mappings: true } })
    return (source?.mappings ?? []) as unknown as FieldMapping[]
  }

  async setMappings(id: string, mappings: FieldMapping[]): Promise<void> {
    // Prisma's Json type needs the double cast via unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.db.source.update({ where: { id }, data: { mappings: mappings as unknown as any } })
  }
}

export class PrismaListingRepository implements ListingRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(listing: ListingUpsertData): Promise<void> {
    const existing = await this.db.listing.findUnique({
      where: {
        sourceId_externalId: {
          sourceId: listing.sourceId,
          externalId: listing.externalId ?? '',
        },
      },
      select: { id: true, priceCents: true },
    })

    const priceChanged =
      existing !== null &&
      listing.priceCents !== undefined &&
      listing.priceCents !== existing.priceCents

    if (existing !== null && !priceChanged) {
      return
    }

    await this.db.listing.upsert({
      where: {
        sourceId_externalId: {
          sourceId: listing.sourceId,
          externalId: listing.externalId ?? '',
        },
      },
      update: {
        priceCents: listing.priceCents,
        mileage: listing.mileage,
        scrapedAt: new Date(),
        status: 'active',
        goneAt: null,
        // description and images are managed by the detail scrape job — don't overwrite
      },
      create: {
        sourceId: listing.sourceId,
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
        ...(listing.priceCents != null
          ? { priceHistory: { create: { priceCents: listing.priceCents } } }
          : {}),
      },
    })

    if (priceChanged && listing.priceCents != null) {
      await this.db.listingPriceHistory.create({
        data: { listingId: existing!.id, priceCents: listing.priceCents },
      })
    }
  }

  async markGone(sourceId: string, activeExternalIds: string[]): Promise<number> {
    // Guard: if the scrape returned nothing, assume a scraper failure and leave status unchanged
    if (activeExternalIds.length === 0) return 0

    const result = await this.db.listing.updateMany({
      where: {
        sourceId,
        status: 'active',
        externalId: { notIn: activeExternalIds },
      },
      data: { status: 'gone', goneAt: new Date() },
    })

    return result.count
  }
}
