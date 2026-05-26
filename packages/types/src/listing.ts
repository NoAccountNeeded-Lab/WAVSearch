export type ConversionType = 'rear_entry' | 'side_entry' | 'unknown'
export type RampType = 'in_floor' | 'fold_out' | 'fold_in' | 'none' | 'unknown'
export type ListingCondition = 'new' | 'used' | 'certified_pre_owned'
export type ListingSellerType = 'dealer' | 'private'

export interface WavFeatures {
  conversionType: ConversionType
  conversionManufacturer: string | null
  floorLoweringInches: number | null
  rampType: RampType
  hasLift: boolean
  handControls: boolean
  transferSeat: boolean
  wheelchairCapacity: number | null
}

export interface ListingLocation {
  zip: string | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
}

export interface ListingDealer {
  name: string | null
  phone: string | null
  website: string | null
}

export interface Listing {
  id: string
  sourceId: string
  sourceUrl: string
  externalId: string | null

  make: string
  model: string
  year: number
  trim: string | null
  vin: string | null
  condition: ListingCondition
  sellerType: ListingSellerType

  priceCents: number | null
  mileage: number | null
  color: string | null
  fuelType: string | null
  transmission: string | null

  wav: WavFeatures
  location: ListingLocation
  dealer: ListingDealer

  images: string[]
  description: string | null

  listedAt: Date
  updatedAt: Date
  scrapedAt: Date
}

export type ListingPreview = Pick<
  Listing,
  | 'id'
  | 'sourceId'
  | 'sourceUrl'
  | 'make'
  | 'model'
  | 'year'
  | 'condition'
  | 'sellerType'
  | 'priceCents'
  | 'mileage'
  | 'location'
  | 'wav'
  | 'images'
  | 'listedAt'
>
