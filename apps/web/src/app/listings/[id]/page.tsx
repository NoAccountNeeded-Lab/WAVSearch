import type { Metadata } from 'next'
import { Accessibility, Gauge, ShieldCheck, TrendingUp, Info } from 'lucide-react'
import { notFound } from 'next/navigation'
import { getServerApiBaseUrl } from '@/lib/api-url'
import { apiFetch } from '@/lib/api-fetch'
import { PhotoGallery } from '@/components/PhotoGallery'
import { BackButton } from './BackButton'
import { ListingSheet } from './ListingSheet'
import { OverviewTab } from './OverviewTab'
import { WavTab } from './WavTab'
import { VehicleTab } from './VehicleTab'
import { MarketTab } from './MarketTab'
import { SafetyTab } from './SafetyTab'
import type {
  ListingDetail,
  MarketPricing,
  ModelResearch,
  PricePoint,
  SafetyData,
  SimilarListing,
  VehicleStats,
} from './types'
import { conditionLabel, formatPrice } from './utils'
import styles from './page.module.css'

// ── Data fetchers ──────────────────────────────────────────────────────────

async function getListing(id: string): Promise<ListingDetail | null> {
  try {
    const res = await apiFetch(`${getServerApiBaseUrl()}/v1/listings/${id}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: ListingDetail }
    return json.data
  } catch {
    return null
  }
}

async function getPriceHistory(id: string): Promise<PricePoint[]> {
  try {
    const res = await apiFetch(`${getServerApiBaseUrl()}/v1/listings/${id}/price-history`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const json = (await res.json()) as { data: PricePoint[] }
    return json.data ?? []
  } catch {
    return []
  }
}

async function getSafety(id: string): Promise<SafetyData | null> {
  try {
    const res = await apiFetch(`${getServerApiBaseUrl()}/v1/listings/${id}/safety`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: SafetyData }
    return json.data
  } catch {
    return null
  }
}

async function getMarketPricing(
  make: string,
  model: string,
  year: number,
): Promise<MarketPricing | null> {
  try {
    const url = new URL(`${getServerApiBaseUrl()}/v1/market/pricing`)
    url.searchParams.set('make', make)
    url.searchParams.set('model', model)
    url.searchParams.set('year', String(year))
    const res = await apiFetch(url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = (await res.json()) as { data: MarketPricing }
    return json.data
  } catch {
    return null
  }
}

async function getModelResearch(
  make: string,
  model: string,
  year: number,
): Promise<ModelResearch | null> {
  try {
    const res = await apiFetch(
      `${getServerApiBaseUrl()}/v1/vehicles/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${year}/research`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { data: ModelResearch | null }
    return json.data
  } catch {
    return null
  }
}

async function getVehicleStats(
  make: string,
  model: string,
  year: number,
): Promise<VehicleStats | null> {
  try {
    const url = new URL(
      `${getServerApiBaseUrl()}/v1/vehicles/${encodeURIComponent(make)}/${encodeURIComponent(model)}/stats`,
    )
    url.searchParams.set('year', String(year))
    const res = await apiFetch(url.toString(), { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const json = (await res.json()) as { data: VehicleStats | null }
    return json.data
  } catch {
    return null
  }
}

async function getSimilar(
  make: string,
  model: string,
  year: number,
  excludeId: string,
): Promise<SimilarListing[]> {
  try {
    const url = new URL(`${getServerApiBaseUrl()}/v1/listings`)
    url.searchParams.set('make', make)
    url.searchParams.set('model', model)
    url.searchParams.set('yearMin', String(year - 2))
    url.searchParams.set('yearMax', String(year + 2))
    url.searchParams.set('perPage', '5')
    const res = await apiFetch(url.toString(), { next: { revalidate: 300 } })
    if (!res.ok) return []
    const json = (await res.json()) as { data: SimilarListing[] }
    return (json.data ?? []).filter((l) => l.id !== excludeId).slice(0, 3)
  } catch {
    return []
  }
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Listing not found — WAV Search' }
  const title = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}`
  return {
    title: `${title} — WAV Search`,
    description: `${formatPrice(listing.priceCents)} · ${listing.location.city && listing.location.state ? `${listing.location.city}, ${listing.location.state} · ` : ''}Wheelchair accessible vehicle`,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ListingDetailV2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) notFound()

  const [priceHistory, safety, marketPricing, similar, modelResearch, vehicleStats] =
    await Promise.all([
      getPriceHistory(id),
      getSafety(id),
      getMarketPricing(listing.make, listing.model, listing.year),
      getSimilar(listing.make, listing.model, listing.year, id),
      getModelResearch(listing.make, listing.model, listing.year),
      getVehicleStats(listing.make, listing.model, listing.year),
    ])

  const vehicleTitle = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}`
  const location = [listing.location.city, listing.location.state].filter(Boolean).join(', ')

  const openRecallCount = (safety?.recalls ?? []).filter(
    (r) => !r.remedy || r.remedy.trim() === '',
  ).length

  const tabs = [
    {
      id: 'wav',
      label: 'WAV',
      icon: <Accessibility size={14} aria-hidden />,
      content: <WavTab listing={listing} />,
    },
    {
      id: 'vehicle',
      label: 'Vehicle',
      icon: <Gauge size={14} aria-hidden />,
      content: (
        <VehicleTab listing={listing} modelResearch={modelResearch} vehicleStats={vehicleStats} />
      ),
    },
    {
      id: 'overview',
      label: 'Overview',
      icon: <Info size={14} aria-hidden />,
      content: <OverviewTab listing={listing} priceHistory={priceHistory} />,
    },
    {
      id: 'market',
      label: 'Market',
      icon: <TrendingUp size={14} aria-hidden />,
      content: (
        <MarketTab
          listing={listing}
          marketPricing={marketPricing}
          priceHistory={priceHistory}
          similar={similar}
        />
      ),
    },
    {
      id: 'safety',
      label: openRecallCount > 0 ? `Safety (${openRecallCount})` : 'Safety',
      icon: <ShieldCheck size={14} aria-hidden />,
      content: <SafetyTab listing={listing} safety={safety} />,
    },
  ]

  return (
    <main id="main-content" className={styles.page}>
      {/* Header — vehicle identity */}
      <header className={styles.header}>
        <BackButton />
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>{vehicleTitle}</h1>
          <p className={styles.headerMeta}>
            <span className={styles.headerPrice}>{formatPrice(listing.priceCents)}</span>
            {listing.condition && (
              <span className={styles.headerDot}>{conditionLabel(listing.condition)}</span>
            )}
            {location && <span className={styles.headerDot}>{location}</span>}
          </p>
        </div>
      </header>

      {/* Photo gallery — swipeable, contains full car */}
      <div className={styles.galleryWrap}>
        <PhotoGallery
          images={listing.images}
          alt={vehicleTitle}
          className={styles.gallery}
          viewportClassName={styles.galleryViewport}
          imageClassName={styles.galleryImage}
          dotsClassName={styles.galleryDots}
          showExpand={false}
        />
      </div>

      {/* Spacer so gallery doesn't hide under the sheet peek */}
      <div className={styles.sheetSpacer} aria-hidden />

      {/* Bottom sheet with tabs */}
      <ListingSheet tabs={tabs} />
    </main>
  )
}
