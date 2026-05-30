import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ImageGallery } from '@/components/ImageGallery'
import { getServerApiBaseUrl } from '@/lib/api-url'
import styles from './page.module.css'

interface ListingDetail {
  id: string
  sourceUrl: string
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
  dealerName: string | null
  dealerPhone: string | null
  dealerWebsite: string | null
  images: string[]
  description: string | null
  listedAt: string
}

async function getListing(id: string): Promise<ListingDetail | null> {
  const res = await fetch(`${getServerApiBaseUrl()}/v1/listings/${id}`, {
    next: { revalidate: 60 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to fetch listing')
  const json = (await res.json()) as { data: ListingDetail }
  return json.data
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Listing not found' }
  const title = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}`
  return {
    title: `${title} — WAV Search`,
    description: `${formatPrice(listing.priceCents)} · ${listing.city && listing.state ? `${listing.city}, ${listing.state} · ` : ''}Wheelchair accessible vehicle`,
  }
}

function formatPrice(cents: number | null): string {
  if (cents === null) return 'Call for price'
  return `$${(cents / 100).toLocaleString()}`
}

function formatEnum(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) notFound()

  const vehicleTitle = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}`

  const wavBadges: string[] = []
  if (listing.conversionType !== 'unknown') wavBadges.push(formatEnum(listing.conversionType))
  if (listing.rampType !== 'unknown' && listing.rampType !== 'none') wavBadges.push(`${formatEnum(listing.rampType)} Ramp`)
  if (listing.hasLift) wavBadges.push('Lift')
  if (listing.handControls) wavBadges.push('Hand Controls')
  if (listing.transferSeat) wavBadges.push('Transfer Seat')

  return (
    <main id="main-content" className={styles.page}>
      <Link href="/filters" className={styles.back}>← Back to listings</Link>

      <ImageGallery images={listing.images} alt={vehicleTitle} />

      <h1 className={styles.title}>{vehicleTitle}</h1>
      <div className={styles.price}>{formatPrice(listing.priceCents)}</div>

      {wavBadges.length > 0 && (
        <div className={styles.badges}>
          {wavBadges.map((b) => (
            <span key={b} className={styles.badge}>{b}</span>
          ))}
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>WAV features</h2>
        <div className={styles.grid}>
          <Field label="Conversion type" value={formatEnum(listing.conversionType)} />
          <Field label="Ramp type" value={formatEnum(listing.rampType)} />
          <Field label="Has lift" value={listing.hasLift} bool />
          <Field label="Hand controls" value={listing.handControls} bool />
          <Field label="Transfer seat" value={listing.transferSeat} bool />
          {listing.floorLoweringInches !== null && (
            <Field label="Floor lowering" value={`${listing.floorLoweringInches}"`} />
          )}
          {listing.wheelchairCapacity !== null && (
            <Field label="Wheelchair capacity" value={String(listing.wheelchairCapacity)} />
          )}
          {listing.conversionManufacturer && (
            <Field label="Conversion by" value={listing.conversionManufacturer} />
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Vehicle details</h2>
        <div className={styles.grid}>
          <Field label="Condition" value={formatEnum(listing.condition)} />
          <Field label="Seller" value={formatEnum(listing.sellerType)} />
          {listing.mileage !== null && <Field label="Mileage" value={`${listing.mileage.toLocaleString()} mi`} />}
          {listing.color && <Field label="Color" value={listing.color} />}
          {listing.fuelType && <Field label="Fuel type" value={listing.fuelType} />}
          {listing.transmission && <Field label="Transmission" value={listing.transmission} />}
          {listing.vin && <Field label="VIN" value={listing.vin} />}
        </div>
      </section>

      {(listing.city ?? listing.dealerName) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Location & seller</h2>
          <div className={styles.grid}>
            {(listing.city ?? listing.state) && (
              <Field label="Location" value={[listing.city, listing.state].filter(Boolean).join(', ')} />
            )}
            {listing.zip && <Field label="ZIP" value={listing.zip} />}
            {listing.dealerName && <Field label="Dealer" value={listing.dealerName} />}
            {listing.dealerPhone && <Field label="Phone" value={listing.dealerPhone} />}
            {listing.dealerWebsite && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Website</span>
                <a
                  href={listing.dealerWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fieldLink}
                >
                  {listing.dealerWebsite.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {listing.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Description</h2>
          <p className={styles.description}>{listing.description}</p>
        </section>
      )}

      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.cta}>
        View original listing ↗
      </a>

      <p className={styles.meta}>Listed {formatDate(listing.listedAt)}</p>
    </main>
  )
}

function Field({ label, value, bool }: { label: string; value: string | boolean | null; bool?: boolean }) {
  const display = bool
    ? (value as boolean)
      ? <span className={styles.boolTrue}>Yes</span>
      : <span className={styles.boolFalse}>No</span>
    : <span className={styles.fieldValue}>{value as string}</span>

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {display}
    </div>
  )
}
