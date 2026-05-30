import { Suspense } from 'react'
import Link from 'next/link'
import { SortSelect } from '../../components/SearchFilters'
import { CategoryBarChart } from '../../components/CategoryBarChart'
import { ActiveFilters } from '../../components/ActiveFilters'
import ListingsMapLoader from '../../components/ListingsMapLoader'
import type { MapListing } from '../../components/ListingsMap'
import { getServerApiBaseUrl } from '@/lib/api-url'
import styles from './page.module.css'

// ── Types ────────────────────────────────────────────────

interface ListingDoc {
  id: string
  make: string
  model: string
  year: number
  trim: string | null
  priceCents: number | null
  mileage: number | null
  city: string | null
  state: string | null
  lat: number | null
  lng: number | null
  condition: string
  sellerType: string
  conversionType: string
  hasLift: boolean
  handControls: boolean
  rampType: string
  sourceUrl: string
}

interface Pagination {
  page: number
  perPage: number
  total: number
  totalPages: number
}

interface ListingsResponse {
  data: ListingDoc[]
  pagination: Pagination
}

// ── Data fetching ────────────────────────────────────────

async function fetchListings(
  searchParams: Record<string, string>,
): Promise<ListingsResponse> {
  const base = getServerApiBaseUrl()
  const url = new URL(`${base}/v1/listings`)

  const forward = [
    'q', 'page', 'make', 'model',
    'yearMin', 'yearMax', 'priceMin', 'priceMax', 'mileageMax',
    'condition', 'conversionType', 'rampType', 'hasLift', 'handControls', 'color', 'state', 'sort',
  ]

  for (const key of forward) {
    const val = searchParams[key]
    if (val) url.searchParams.set(key, val)
  }

  if (!url.searchParams.has('sort')) {
    url.searchParams.set('sort', 'listedAt:desc')
  }

  const res = await fetch(url.toString(), { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`Listings fetch failed: ${res.status}`)
  return res.json() as Promise<ListingsResponse>
}

// ── Helpers ──────────────────────────────────────────────

function formatPrice(cents: number | null): string {
  if (cents === null) return 'Call for price'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatMileage(miles: number | null): string | null {
  if (miles === null) return null
  return `${new Intl.NumberFormat('en-US').format(miles)} mi`
}

function formatCondition(cond: string): string {
  if (cond === 'certified_pre_owned') return 'CPO'
  return cond.charAt(0).toUpperCase() + cond.slice(1)
}

function formatConversionType(type: string): string | null {
  if (type === 'rear_entry') return 'Rear entry'
  if (type === 'side_entry') return 'Side entry'
  return null
}

function formatRampType(type: string): string | null {
  if (type === 'in_floor') return 'In-floor ramp'
  if (type === 'fold_out') return 'Fold-out ramp'
  if (type === 'fold_in') return 'Fold-in ramp'
  return null
}

// ── Listing card ─────────────────────────────────────────

function ListingCard({ listing: l }: { listing: ListingDoc }) {
  const wavFeatures: string[] = []
  const conversionLabel = formatConversionType(l.conversionType)
  const rampLabel = formatRampType(l.rampType)
  if (conversionLabel) wavFeatures.push(conversionLabel)
  if (l.hasLift) wavFeatures.push('Has lift')
  if (l.handControls) wavFeatures.push('Hand controls')
  if (rampLabel) wavFeatures.push(rampLabel)

  const title = [l.year, l.make, l.model, l.trim].filter(Boolean).join(' ')
  const location = [l.city, l.state].filter(Boolean).join(', ')
  const mileage = formatMileage(l.mileage)

  return (
    <article className={styles.card}>
      <Link href={`/filters/${l.id}`} className={styles.cardLink}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <p className={styles.cardPrice}>{formatPrice(l.priceCents)}</p>

        <p className={styles.cardMeta}>
          {mileage && <span className={styles.metaItem}>{mileage}</span>}
          {location && <span className={styles.metaItem}>{location}</span>}
          <span className={styles.metaItem}>{formatCondition(l.condition)}</span>
          {l.sellerType === 'private' && (
            <span className={styles.metaItem}>Private seller</span>
          )}
        </p>

        {wavFeatures.length > 0 && (
          <ul className={styles.wavBadges} aria-label="WAV features">
            {wavFeatures.map((f) => (
              <li key={f} className={`${styles.badge} ${styles.badgeGreen}`}>
                {f}
              </li>
            ))}
          </ul>
        )}
      </Link>
    </article>
  )
}

// ── Pagination ───────────────────────────────────────────

function PaginationNav({
  pagination,
  currentParams,
}: {
  pagination: Pagination
  currentParams: Record<string, string>
}) {
  const { page, totalPages } = pagination

  const buildHref = (p: number) => {
    const params = new URLSearchParams(currentParams)
    params.set('page', String(p))
    return `/filters?${params.toString()}`
  }

  return (
    <nav aria-label="Pagination" className={styles.pagination}>
      {page > 1 ? (
        <Link href={buildHref(page - 1)} className={styles.paginationBtn}>
          Previous
        </Link>
      ) : (
        <span
          className={`${styles.paginationBtn} ${styles.paginationBtnDisabled}`}
          aria-disabled="true"
        >
          Previous
        </span>
      )}

      <span className={styles.paginationInfo} aria-current="page">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link href={buildHref(page + 1)} className={styles.paginationBtn}>
          Next
        </Link>
      ) : (
        <span
          className={`${styles.paginationBtn} ${styles.paginationBtnDisabled}`}
          aria-disabled="true"
        >
          Next
        </span>
      )}
    </nav>
  )
}

// ── Page ─────────────────────────────────────────────────

interface ListingsPageProps {
  searchParams: Promise<Record<string, string>>
}

export default async function ListingsPage({ searchParams }: ListingsPageProps) {
  const params = await searchParams
  const { data: listings, pagination } = await fetchListings(params)

  const mappableListings: MapListing[] = listings.flatMap((l) =>
    l.lat != null && l.lng != null
      ? [{
          id: l.id,
          lat: l.lat,
          lng: l.lng,
          year: l.year,
          make: l.make,
          model: l.model,
          trim: l.trim,
          priceCents: l.priceCents,
          city: l.city,
          state: l.state,
        }]
      : [],
  )

  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <a href="/" className={styles.logo} aria-label="WAV Search — go to home">
            <span className={styles.logoAccent}>WAV</span> Search
          </a>
          <span className={styles.divider} aria-hidden="true">/</span>
          <span className={styles.sectionText}>Wheelchair Accessible Vehicles</span>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <div className={styles.container}>

          <section className={styles.searchSection}>
            {/* Client components use useSearchParams — must be in Suspense */}
            <Suspense>
              <CategoryBarChart />
            </Suspense>
          </section>

          {mappableListings.length > 0 && (
            <section
              aria-label="Map of vehicle locations"
              className={styles.mapSection}
            >
              {/* Screen-reader note: list below is the accessible primary interface */}
              <p className="sr-only">
                An interactive map showing vehicle locations on the current page.
                All vehicles are also listed below in accessible list format.
              </p>
              <ListingsMapLoader listings={mappableListings} />
            </section>
          )}

          <section aria-label="Search results" className={styles.resultsSection}>
            <div className={styles.resultsHeader}>
              <p
                className={styles.resultsCount}
                aria-live="polite"
                aria-atomic="true"
              >
                {pagination.total.toLocaleString()}{' '}
                {pagination.total === 1 ? 'vehicle' : 'vehicles'} found
              </p>
              <Suspense>
                <SortSelect />
              </Suspense>
            </div>
            <Suspense>
              <ActiveFilters />
            </Suspense>

            {listings.length > 0 ? (
              <>
                <ul className={styles.listingsGrid} role="list">
                  {listings.map((listing) => (
                    <li key={listing.id}>
                      <ListingCard listing={listing} />
                    </li>
                  ))}
                </ul>

                {pagination.totalPages > 1 && (
                  <PaginationNav pagination={pagination} currentParams={params} />
                )}
              </>
            ) : (
              <div className={styles.emptyState} role="status">
                <p>No vehicles match your current filters.</p>
                <a href="/filters">Clear all filters</a>
              </div>
            )}
          </section>

        </div>
      </main>
    </>
  )
}
