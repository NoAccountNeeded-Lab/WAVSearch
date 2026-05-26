import type { PrismaClient } from '@wav-search/db'
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

  async markActive(id: string, data: { listingCount: number; fingerprintHash: string }): Promise<void> {
    await this.db.source.update({
      where: { id },
      data: {
        lastScrapedAt: new Date(),
        listingCount: data.listingCount,
        fingerprintHash: data.fingerprintHash,
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
}

export class PrismaListingRepository implements ListingRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(listing: ListingUpsertData): Promise<void> {
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
        description: listing.description,
        images: listing.images,
        scrapedAt: new Date(),
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
      },
    })
  }
}
