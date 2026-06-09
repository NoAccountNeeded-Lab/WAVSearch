export interface ListingDetail {
  id: string
  sourceUrl: string
  buyerUrl: string | null
  make: string
  model: string
  year: number
  trim: string | null
  vin: string | null
  condition: string
  sellerType: string
  priceCents: number | null
  mileage: number | null
  color: string | null
  fuelType: string | null
  transmission: string | null
  conversionType: string
  conversionManufacturer: string | null
  floorLoweringInches: number | null
  rampType: string
  hasLift: boolean
  handControls: boolean
  transferSeat: boolean
  wheelchairCapacity: number | null
  zip: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  dealerName: string | null
  dealerPhone: string | null
  dealerWebsite: string | null
  images: string[]
  description: string | null
  listedAt: string
  updatedAt: string
}

export interface PricePoint {
  id: string
  priceCents: number
  recordedAt: string
}

export interface Recall {
  id: string
  nhtsaCampaignId: string
  component: string
  summary: string
  remedy: string | null
  reportedAt: string
}

export interface SafetyRating {
  id: string
  overallRating: number | null
  frontCrashRating: number | null
  sideCrashRating: number | null
  rolloverRating: number | null
  rolloverRatingText: string | null
  description: string | null
}

export interface SafetyData {
  vehicleModel: { id: string; make: string; model: string; year: number } | null
  recalls: Recall[]
  complaints: {
    id: string
    nhtsaId: string
    component: string
    summary: string
    mileage: number | null
  }[]
  safetyRatings: SafetyRating[]
}

export interface MarketPricing {
  count: number
  priceCents: {
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
  } | null
  medianDaysListed: number | null
  priceDropRate: number | null
}

export interface SimilarListing {
  id: string
  make: string
  model: string
  year: number
  priceCents: number | null
  mileage: number | null
  city: string | null
  state: string | null
  condition: string
  rampType: string
  conversionManufacturer: string | null
  listedAt: string
}

export interface ModelResearchSource {
  id: string
  sourceName: string
  sourceUrl: string
  fetchedAt: string
}

export interface ModelResearchClaim {
  id: string
  field: string
  claimText: string
  confidence: string
  sourceId: string | null
}

export interface ModelResearch {
  vehicleModel: { id: string; make: string; model: string; year: number }
  researchVersion: number
  researchedAt: string
  sources: ModelResearchSource[]
  claims: ModelResearchClaim[]
}

export interface VehicleStatsSource {
  name: string
  url: string
}

export interface VehicleStats {
  make: string
  model: string
  year: number | null
  avgLifespanMiles: number | null
  reliabilityScore: number | null
  reliabilitySource: string | null
  jdPowerScore: number | null
  methodology: string | null
  refreshedAt: string | null
  sources: VehicleStatsSource[]
}
