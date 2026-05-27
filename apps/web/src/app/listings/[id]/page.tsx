import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ImageGallery } from '@/components/ImageGallery'

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
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/listings/${id}`, {
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

const styles = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '1rem',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,
  back: {
    display: 'inline-block',
    marginBottom: '1rem',
    color: '#0066CC',
    textDecoration: 'none',
    fontSize: '0.875rem',
  } as React.CSSProperties,
  title: {
    margin: '0 0 0.25rem',
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1.2,
  } as React.CSSProperties,
  price: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#0066CC',
    margin: '0.5rem 0',
  } as React.CSSProperties,
  badges: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
    margin: '0.75rem 0 1.25rem',
  } as React.CSSProperties,
  badge: {
    padding: '0.25rem 0.625rem',
    borderRadius: 999,
    fontSize: '0.75rem',
    fontWeight: 600,
    background: '#e8f0fe',
    color: '#1a56db',
  } as React.CSSProperties,
  section: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: '1rem',
    marginTop: '1rem',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: '0.75rem',
    marginTop: 0,
  } as React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.625rem 1rem',
  } as React.CSSProperties,
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '0.7rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#6b7280',
  } as React.CSSProperties,
  fieldValue: {
    fontSize: '0.9rem',
    color: '#111',
  } as React.CSSProperties,
  boolTrue: {
    color: '#059669',
    fontWeight: 600,
  } as React.CSSProperties,
  boolFalse: {
    color: '#9ca3af',
  } as React.CSSProperties,
  description: {
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: '#374151',
    whiteSpace: 'pre-wrap' as const,
    marginTop: 0,
  } as React.CSSProperties,
  cta: {
    display: 'block',
    width: '100%',
    padding: '0.875rem',
    background: '#0066CC',
    color: '#fff',
    textAlign: 'center' as const,
    textDecoration: 'none',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: '1rem',
    marginTop: '1.5rem',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  meta: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginTop: '1.5rem',
    borderTop: '1px solid #e5e7eb',
    paddingTop: '0.75rem',
  } as React.CSSProperties,
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
    <main style={styles.page}>
      <Link href="/" style={styles.back}>← Back to listings</Link>

      <ImageGallery images={listing.images} alt={vehicleTitle} />

      <h1 style={styles.title}>{vehicleTitle}</h1>
      <div style={styles.price}>{formatPrice(listing.priceCents)}</div>

      {wavBadges.length > 0 && (
        <div style={styles.badges}>
          {wavBadges.map((b) => (
            <span key={b} style={styles.badge}>{b}</span>
          ))}
        </div>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>WAV Features</h2>
        <div style={styles.grid}>
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

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Vehicle Details</h2>
        <div style={styles.grid}>
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
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Location & Seller</h2>
          <div style={styles.grid}>
            {(listing.city ?? listing.state) && (
              <Field label="Location" value={[listing.city, listing.state].filter(Boolean).join(', ')} />
            )}
            {listing.zip && <Field label="ZIP" value={listing.zip} />}
            {listing.dealerName && <Field label="Dealer" value={listing.dealerName} />}
            {listing.dealerPhone && <Field label="Phone" value={listing.dealerPhone} />}
            {listing.dealerWebsite && (
              <div style={styles.field}>
                <span style={styles.fieldLabel}>Website</span>
                <a href={listing.dealerWebsite} target="_blank" rel="noopener noreferrer" style={{ color: '#0066CC', fontSize: '0.9rem' }}>
                  {listing.dealerWebsite.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {listing.description && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Description</h2>
          <p style={styles.description}>{listing.description}</p>
        </section>
      )}

      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" style={styles.cta}>
        View original listing ↗
      </a>

      <p style={styles.meta}>Listed {formatDate(listing.listedAt)}</p>
    </main>
  )
}

function Field({ label, value, bool }: { label: string; value: string | boolean; bool?: boolean }) {
  const display = bool
    ? (value as boolean)
      ? <span style={styles.boolTrue}>Yes</span>
      : <span style={styles.boolFalse}>No</span>
    : <span style={styles.fieldValue}>{value as string}</span>

  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {display}
    </div>
  )
}
