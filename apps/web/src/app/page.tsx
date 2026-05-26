interface Listing {
  id: string
  make: string
  model: string
  year: number
  trim: string | null
  priceCents: number | null
  mileage: number | null
  city: string | null
  state: string | null
  condition: string
  conversionType: string
  sourceUrl: string
}

interface ListingsResponse {
  data: Listing[]
  pagination: { page: number; perPage: number; total: number; totalPages: number }
}

async function getListings(): Promise<ListingsResponse> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/listings`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch listings')
  return res.json()
}

function formatPrice(cents: number | null): string {
  if (cents === null) return 'Call for price'
  return `$${(cents / 100).toLocaleString()}`
}

export default async function HomePage() {
  const { data: listings, pagination } = await getListings()

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <h1>WAV Search</h1>
      <p>{pagination.total} wheelchair accessible vehicles</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {listings.map((listing) => (
          <li key={listing.id} style={{ borderBottom: '1px solid #ccc', padding: '0.75rem 0' }}>
            <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <strong>
                {listing.year} {listing.make} {listing.model}
                {listing.trim ? ` ${listing.trim}` : ''}
              </strong>
              {' — '}
              {formatPrice(listing.priceCents)}
              {listing.mileage !== null && ` · ${listing.mileage.toLocaleString()} mi`}
              {listing.city && listing.state && ` · ${listing.city}, ${listing.state}`}
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
