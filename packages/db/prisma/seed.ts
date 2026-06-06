#!/usr/bin/env tsx
/**
 * Loads a realistic set of WAV listing fixtures into the database.
 * Safe to run multiple times — upserts on (sourceId, externalId).
 *
 * Usage:
 *   pnpm --filter @wivwav/db db:seed
 *   make db-seed
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ── Seed source ───────────────────────────────────────────────────────────────

const SOURCE = {
  name: 'Seed Data',
  baseUrl: 'https://example.com',
  cronExpression: '0 0 1 1 *',
  timezone: 'America/New_York',
} as const

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXTURES = [
  {
    externalId: 'seed-001',
    sourceUrl: 'https://example.com/listings/seed-001',
    make: 'Chrysler', model: 'Pacifica', year: 2022, trim: 'Touring L',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 4895000, mileage: 28400, color: 'white',
    conversionType: 'rear_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'BraunAbility', floorLoweringInches: 3.0,
    city: 'Columbus', state: 'OH', zip: '43215', lat: 39.9612, lng: -82.9988,
    dealerName: 'Central Ohio Mobility', dealerPhone: '614-555-0101',
    listedAt: new Date('2025-11-01'),
  },
  {
    externalId: 'seed-002',
    sourceUrl: 'https://example.com/listings/seed-002',
    make: 'Toyota', model: 'Sienna', year: 2023, trim: 'XLE',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 5299000, mileage: 14200, color: 'silver',
    conversionType: 'side_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'VMI', floorLoweringInches: 2.5,
    city: 'Dallas', state: 'TX', zip: '75201', lat: 32.7767, lng: -96.7970,
    dealerName: 'Lone Star Mobility', dealerPhone: '214-555-0202',
    listedAt: new Date('2025-10-15'),
  },
  {
    externalId: 'seed-003',
    sourceUrl: 'https://example.com/listings/seed-003',
    make: 'Dodge', model: 'Grand Caravan', year: 2019, trim: 'SXT',
    condition: 'used' as const, sellerType: 'private' as const,
    priceCents: 2895000, mileage: 67000, color: 'gray',
    conversionType: 'rear_entry' as const, rampType: 'fold_in' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: null, floorLoweringInches: null,
    city: 'Chicago', state: 'IL', zip: '60601', lat: 41.8827, lng: -87.6233,
    dealerName: null, dealerPhone: null,
    listedAt: new Date('2025-11-10'),
  },
  {
    externalId: 'seed-004',
    sourceUrl: 'https://example.com/listings/seed-004',
    make: 'Honda', model: 'Odyssey', year: 2021, trim: 'EX-L',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 4195000, mileage: 22800, color: 'blue',
    conversionType: 'side_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'Vantage Mobility', floorLoweringInches: 2.0,
    city: 'Phoenix', state: 'AZ', zip: '85001', lat: 33.4484, lng: -112.0740,
    dealerName: 'Desert Mobility Solutions', dealerPhone: '602-555-0303',
    listedAt: new Date('2025-09-20'),
  },
  {
    externalId: 'seed-005',
    sourceUrl: 'https://example.com/listings/seed-005',
    make: 'Chrysler', model: 'Pacifica', year: 2024, trim: 'Limited',
    condition: 'new' as const, sellerType: 'dealer' as const,
    priceCents: 6850000, mileage: 0, color: 'black',
    conversionType: 'rear_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'BraunAbility', floorLoweringInches: 3.5,
    city: 'Atlanta', state: 'GA', zip: '30301', lat: 33.7490, lng: -84.3880,
    dealerName: 'Peachtree Mobility', dealerPhone: '404-555-0404',
    listedAt: new Date('2025-12-01'),
  },
  {
    externalId: 'seed-006',
    sourceUrl: 'https://example.com/listings/seed-006',
    make: 'Toyota', model: 'Sienna', year: 2020, trim: 'LE',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 3695000, mileage: 41500, color: 'red',
    conversionType: 'rear_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: true, transferSeat: false,
    conversionManufacturer: 'Freedom Motors', floorLoweringInches: null,
    city: 'Seattle', state: 'WA', zip: '98101', lat: 47.6062, lng: -122.3321,
    dealerName: 'Pacific Northwest Mobility', dealerPhone: '206-555-0505',
    listedAt: new Date('2025-10-05'),
  },
  {
    externalId: 'seed-007',
    sourceUrl: 'https://example.com/listings/seed-007',
    make: 'Ford', model: 'Transit', year: 2022, trim: '350 XLT',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 5495000, mileage: 35600, color: 'white',
    conversionType: 'rear_entry' as const, rampType: 'fold_out' as const,
    hasLift: true, handControls: false, transferSeat: false,
    conversionManufacturer: null, floorLoweringInches: null, wheelchairCapacity: 4,
    city: 'Miami', state: 'FL', zip: '33101', lat: 25.7617, lng: -80.1918,
    dealerName: 'South Florida Accessibility', dealerPhone: '305-555-0606',
    listedAt: new Date('2025-11-22'),
  },
  {
    externalId: 'seed-008',
    sourceUrl: 'https://example.com/listings/seed-008',
    make: 'Chrysler', model: 'Pacifica', year: 2021, trim: 'Touring',
    condition: 'used' as const, sellerType: 'private' as const,
    priceCents: 3850000, mileage: 52000, color: 'silver',
    conversionType: 'side_entry' as const, rampType: 'fold_in' as const,
    hasLift: false, handControls: false, transferSeat: true,
    conversionManufacturer: 'VMI', floorLoweringInches: 2.5,
    city: 'Denver', state: 'CO', zip: '80201', lat: 39.7392, lng: -104.9903,
    dealerName: null, dealerPhone: null,
    listedAt: new Date('2025-10-30'),
  },
  {
    externalId: 'seed-009',
    sourceUrl: 'https://example.com/listings/seed-009',
    make: 'Honda', model: 'Odyssey', year: 2018, trim: 'LX',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 2250000, mileage: 89500, color: 'tan',
    conversionType: 'rear_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'BraunAbility', floorLoweringInches: 2.0,
    city: 'Boston', state: 'MA', zip: '02101', lat: 42.3601, lng: -71.0589,
    dealerName: 'New England Mobility', dealerPhone: '617-555-0707',
    listedAt: new Date('2025-09-01'),
  },
  {
    externalId: 'seed-010',
    sourceUrl: 'https://example.com/listings/seed-010',
    make: 'Toyota', model: 'Sienna', year: 2024, trim: 'Platinum',
    condition: 'new' as const, sellerType: 'dealer' as const,
    priceCents: 7250000, mileage: 0, color: 'white',
    conversionType: 'side_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'Vantage Mobility', floorLoweringInches: 3.0,
    city: 'Los Angeles', state: 'CA', zip: '90001', lat: 34.0522, lng: -118.2437,
    dealerName: 'SoCal Accessible Vans', dealerPhone: '213-555-0808',
    listedAt: new Date('2025-12-05'),
  },
  {
    externalId: 'seed-011',
    sourceUrl: 'https://example.com/listings/seed-011',
    make: 'Chrysler', model: 'Pacifica', year: 2020, trim: 'Touring L Plus',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 3995000, mileage: 44200, color: 'black',
    conversionType: 'rear_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: true, transferSeat: false,
    conversionManufacturer: 'BraunAbility', floorLoweringInches: 3.0,
    city: 'Philadelphia', state: 'PA', zip: '19101', lat: 39.9526, lng: -75.1652,
    dealerName: 'Liberty Mobility', dealerPhone: '215-555-0909',
    listedAt: new Date('2025-11-08'),
  },
  {
    externalId: 'seed-012',
    sourceUrl: 'https://example.com/listings/seed-012',
    make: 'Dodge', model: 'Grand Caravan', year: 2017, trim: 'SE',
    condition: 'used' as const, sellerType: 'private' as const,
    priceCents: 1595000, mileage: 112000, color: 'blue',
    conversionType: 'rear_entry' as const, rampType: 'fold_in' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: null, floorLoweringInches: null,
    city: 'Detroit', state: 'MI', zip: '48201', lat: 42.3314, lng: -83.0458,
    dealerName: null, dealerPhone: null,
    listedAt: new Date('2025-10-18'),
  },
  {
    externalId: 'seed-013',
    sourceUrl: 'https://example.com/listings/seed-013',
    make: 'Ford', model: 'Explorer', year: 2022, trim: 'XLT',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 4495000, mileage: 19800, color: 'gray',
    conversionType: 'unknown' as const, rampType: 'none' as const,
    hasLift: true, handControls: true, transferSeat: false,
    conversionManufacturer: null, floorLoweringInches: null,
    city: 'Houston', state: 'TX', zip: '77001', lat: 29.7604, lng: -95.3698,
    dealerName: 'Gulf Coast Mobility', dealerPhone: '713-555-1010',
    listedAt: new Date('2025-11-15'),
  },
  {
    externalId: 'seed-014',
    sourceUrl: 'https://example.com/listings/seed-014',
    make: 'Chrysler', model: 'Pacifica', year: 2023, trim: 'Pinnacle',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 5995000, mileage: 8700, color: 'white',
    conversionType: 'side_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'VMI', floorLoweringInches: 2.5,
    city: 'Charlotte', state: 'NC', zip: '28201', lat: 35.2271, lng: -80.8431,
    dealerName: 'Carolina Accessible Vehicles', dealerPhone: '704-555-1111',
    listedAt: new Date('2025-12-01'),
  },
  {
    externalId: 'seed-015',
    sourceUrl: 'https://example.com/listings/seed-015',
    make: 'Toyota', model: 'Sienna', year: 2019, trim: 'XLE Premium',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 3195000, mileage: 55300, color: 'silver',
    conversionType: 'rear_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'Freedom Motors', floorLoweringInches: null,
    city: 'Minneapolis', state: 'MN', zip: '55401', lat: 44.9778, lng: -93.2650,
    dealerName: 'North Star Mobility', dealerPhone: '612-555-1212',
    listedAt: new Date('2025-09-28'),
  },
  {
    externalId: 'seed-016',
    sourceUrl: 'https://example.com/listings/seed-016',
    make: 'Honda', model: 'Odyssey', year: 2022, trim: 'Sport',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 3895000, mileage: 31200, color: 'red',
    conversionType: 'side_entry' as const, rampType: 'fold_in' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'BraunAbility', floorLoweringInches: 2.0,
    city: 'Portland', state: 'OR', zip: '97201', lat: 45.5051, lng: -122.6750,
    dealerName: 'Pacific Mobility Center', dealerPhone: '503-555-1313',
    listedAt: new Date('2025-11-05'),
  },
  {
    externalId: 'seed-017',
    sourceUrl: 'https://example.com/listings/seed-017',
    make: 'Chrysler', model: 'Pacifica', year: 2016, trim: 'Touring',
    condition: 'used' as const, sellerType: 'private' as const,
    priceCents: 2195000, mileage: 78500, color: 'tan',
    conversionType: 'rear_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: null, floorLoweringInches: 2.5,
    city: 'Nashville', state: 'TN', zip: '37201', lat: 36.1627, lng: -86.7816,
    dealerName: null, dealerPhone: null,
    listedAt: new Date('2025-10-12'),
  },
  {
    externalId: 'seed-018',
    sourceUrl: 'https://example.com/listings/seed-018',
    make: 'Ford', model: 'Transit Connect', year: 2021, trim: 'XLT',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 3295000, mileage: 24600, color: 'white',
    conversionType: 'rear_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'Freedom Motors', floorLoweringInches: null,
    city: 'Las Vegas', state: 'NV', zip: '89101', lat: 36.1699, lng: -115.1398,
    dealerName: 'Desert Accessible Vehicles', dealerPhone: '702-555-1414',
    listedAt: new Date('2025-11-20'),
  },
  {
    externalId: 'seed-019',
    sourceUrl: 'https://example.com/listings/seed-019',
    make: 'Toyota', model: 'Sienna', year: 2022, trim: 'Limited',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 4795000, mileage: 17900, color: 'blue',
    conversionType: 'side_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'VMI', floorLoweringInches: 2.5,
    city: 'San Antonio', state: 'TX', zip: '78201', lat: 29.4241, lng: -98.4936,
    dealerName: 'Alamo City Mobility', dealerPhone: '210-555-1515',
    listedAt: new Date('2025-12-02'),
  },
  {
    externalId: 'seed-020',
    sourceUrl: 'https://example.com/listings/seed-020',
    make: 'Chrysler', model: 'Town & Country', year: 2015, trim: 'Touring',
    condition: 'used' as const, sellerType: 'private' as const,
    priceCents: 1350000, mileage: 95400, color: 'gold',
    conversionType: 'rear_entry' as const, rampType: 'fold_in' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: null, floorLoweringInches: null,
    city: 'Kansas City', state: 'MO', zip: '64101', lat: 39.0997, lng: -94.5786,
    dealerName: null, dealerPhone: null,
    listedAt: new Date('2025-10-25'),
  },
  {
    externalId: 'seed-021',
    sourceUrl: 'https://example.com/listings/seed-021',
    make: 'Honda', model: 'Odyssey', year: 2020, trim: 'EX',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 3495000, mileage: 38700, color: 'black',
    conversionType: 'side_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: true, transferSeat: false,
    conversionManufacturer: 'Vantage Mobility', floorLoweringInches: 2.0,
    city: 'San Diego', state: 'CA', zip: '92101', lat: 32.7157, lng: -117.1611,
    dealerName: 'SoCal Accessible Vans', dealerPhone: '619-555-1616',
    listedAt: new Date('2025-11-12'),
  },
  {
    externalId: 'seed-022',
    sourceUrl: 'https://example.com/listings/seed-022',
    make: 'Ford', model: 'F-150', year: 2021, trim: 'XLT',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 4195000, mileage: 33400, color: 'white',
    conversionType: 'unknown' as const, rampType: 'none' as const,
    hasLift: false, handControls: true, transferSeat: true,
    conversionManufacturer: null, floorLoweringInches: null,
    city: 'Austin', state: 'TX', zip: '78701', lat: 30.2672, lng: -97.7431,
    dealerName: 'Texas Mobility Center', dealerPhone: '512-555-1717',
    listedAt: new Date('2025-10-08'),
  },
  {
    externalId: 'seed-023',
    sourceUrl: 'https://example.com/listings/seed-023',
    make: 'Chrysler', model: 'Pacifica', year: 2022, trim: 'Limited',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 5195000, mileage: 21300, color: 'white',
    conversionType: 'rear_entry' as const, rampType: 'in_floor' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'BraunAbility', floorLoweringInches: 3.5,
    city: 'Baltimore', state: 'MD', zip: '21201', lat: 39.2904, lng: -76.6122,
    dealerName: 'Chesapeake Mobility', dealerPhone: '410-555-1818',
    listedAt: new Date('2025-11-25'),
  },
  {
    externalId: 'seed-024',
    sourceUrl: 'https://example.com/listings/seed-024',
    make: 'Toyota', model: 'Sienna', year: 2021, trim: 'XLE',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 4295000, mileage: 26800, color: 'gray',
    conversionType: 'side_entry' as const, rampType: 'fold_in' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'VMI', floorLoweringInches: 2.0,
    city: 'Indianapolis', state: 'IN', zip: '46201', lat: 39.7684, lng: -86.1581,
    dealerName: 'Hoosier Mobility', dealerPhone: '317-555-1919',
    listedAt: new Date('2025-09-15'),
  },
  {
    externalId: 'seed-025',
    sourceUrl: 'https://example.com/listings/seed-025',
    make: 'Dodge', model: 'Grand Caravan', year: 2020, trim: 'GT',
    condition: 'used' as const, sellerType: 'dealer' as const,
    priceCents: 2795000, mileage: 58200, color: 'red',
    conversionType: 'rear_entry' as const, rampType: 'fold_out' as const,
    hasLift: false, handControls: false, transferSeat: false,
    conversionManufacturer: 'Freedom Motors', floorLoweringInches: null,
    city: 'St. Louis', state: 'MO', zip: '63101', lat: 38.6270, lng: -90.1994,
    dealerName: 'Gateway Mobility Solutions', dealerPhone: '314-555-2020',
    listedAt: new Date('2025-10-20'),
  },
]

// ── Run ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const source = await db.source.upsert({
    where: { name: SOURCE.name },
    update: {},
    create: SOURCE,
  })

  let created = 0
  let updated = 0

  for (const f of FIXTURES) {
    const { externalId, dealerName, dealerPhone, wheelchairCapacity, ...fields } = f as typeof f & { wheelchairCapacity?: number }

    const existing = await db.listing.findUnique({
      where: { sourceId_externalId: { sourceId: source.id, externalId } },
      select: { id: true },
    })

    if (existing) {
      await db.listing.update({
        where: { id: existing.id },
        data: { buyerUrl: fields.sourceUrl, priceCents: fields.priceCents, mileage: fields.mileage, scrapedAt: new Date() },
      })
      updated++
    } else {
      await db.listing.create({
        data: {
          sourceId: source.id,
          sourceUrl: fields.sourceUrl,
          buyerUrl: fields.sourceUrl,
          externalId,
          make: fields.make, model: fields.model, year: fields.year, trim: fields.trim,
          condition: fields.condition, sellerType: fields.sellerType,
          priceCents: fields.priceCents, mileage: fields.mileage, color: fields.color,
          conversionType: fields.conversionType, rampType: fields.rampType,
          hasLift: fields.hasLift, handControls: fields.handControls,
          transferSeat: fields.transferSeat,
          conversionManufacturer: fields.conversionManufacturer,
          floorLoweringInches: fields.floorLoweringInches,
          wheelchairCapacity: wheelchairCapacity ?? null,
          city: fields.city, state: fields.state, zip: fields.zip,
          lat: fields.lat, lng: fields.lng,
          dealerName: dealerName ?? null, dealerPhone: dealerPhone ?? null,
          listedAt: fields.listedAt,
        },
      })
      created++
    }
  }

  const total = await db.listing.count()
  console.log(`Seed complete — created ${created}, updated ${updated}. Total listings: ${total}`)

  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
