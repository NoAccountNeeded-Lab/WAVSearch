import type { ConversionType, RampType } from './listing.js'

export interface VehicleModel {
  id: string
  make: string
  model: string
  year: number
  trim: string | null
  bodyType: string | null
}

export interface Recall {
  id: string
  nhtsaCampaignId: string
  vehicleModelId: string
  component: string
  summary: string
  remedy: string | null
  reportedAt: Date
  createdAt: Date
}

export interface Complaint {
  id: string
  nhtsaId: string
  vehicleModelId: string
  component: string
  summary: string
  mileage: number | null
  crashInvolved: boolean
  reportedAt: Date
  createdAt: Date
}

export interface ConversionBrand {
  id: string
  name: string
  slug: string
  website: string | null
  nmedaCertified: boolean
  founded: number | null
}

export interface ConversionProduct {
  id: string
  brandId: string
  name: string
  conversionType: ConversionType
  rampType: RampType
  floorLoweringInches: number | null
  msrpCents: number | null
}

export interface NmeaDealer {
  id: string
  name: string
  address: string | null
  state: string | null
  zip: string | null
  phone: string | null
  website: string | null
  qapCertified: boolean
}
