#!/usr/bin/env node
/**
 * One-off script: scrape page 1 of BLVD.com and upsert listings into the DB.
 * Usage: pnpm --filter @wav-search/scraper exec tsx src/seed.ts
 */
import { getDb } from '@wav-search/db'
import { BlvdAdapter } from './sources/blvd.js'

const db = getDb()

const source = await db.source.upsert({
  where: { name: 'BLVD.com' },
  update: {},
  create: {
    name: 'BLVD.com',
    baseUrl: 'https://www.blvd.com',
    cronExpression: '0 */6 * * *',
    timezone: 'America/New_York',
  },
})

const maxPages = process.env['MAX_PAGES'] ? parseInt(process.env['MAX_PAGES'], 10) : 10
console.log(`Scraping BLVD.com (up to ${maxPages} pages)...`)
const adapter = new BlvdAdapter(source.fingerprintHash, { maxPages })
const { listings } = await adapter.scrape()
console.log(`Scraped ${listings.length} listings. Upserting...`)

for (const listing of listings) {
  await db.listing.upsert({
    where: {
      sourceId_externalId: {
        sourceId: source.id,
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
      sourceId: source.id,
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

const count = await db.listing.count()
console.log(`Done. Total listings in DB: ${count}`)

await db.$disconnect()
