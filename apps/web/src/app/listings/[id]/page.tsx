import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  Accessibility,
  AlertTriangle,
  Armchair,
  ArrowDownFromLine,
  ArrowUpDown,
  Building2,
  Check,
  ChevronLeft,
  DoorOpen,
  ExternalLink,
  Gauge,
  Globe,
  MapPin,
  MoveDown,
  Phone,
  Settings2,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'
import { getServerApiBaseUrl } from '@/lib/api-url'
import { HeroGallery } from './HeroGallery'
import { Collapsible } from './Collapsible'
import styles from './page.module.css'

// ── Types ──────────────────────────────────────────────────────────────────

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

interface PricePoint {
  id: string
  priceCents: number
  recordedAt: string
}

interface Recall {
  id: string
  nhtsaCampaignId: string
  component: string
  summary: string
  remedy: string | null
  reportedAt: string
}

interface SafetyRating {
  id: string
  overallRating: number | null
  frontCrashRating: number | null
  sideCrashRating: number | null
  rolloverRating: number | null
  rolloverRatingText: string | null
  description: string | null
}

interface SafetyData {
  vehicleModel: { id: string; make: string; model: string; year: number } | null
  recalls: Recall[]
  complaints: { id: string; nhtsaId: string; component: string; summary: string; mileage: number | null }[]
  safetyRatings: SafetyRating[]
}

interface MarketPricing {
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

interface SimilarListing {
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

// ── Data fetchers ──────────────────────────────────────────────────────────

async function getListing(id: string): Promise<ListingDetail | null> {
  try {
    const res = await fetch(`${getServerApiBaseUrl()}/v1/listings/${id}`, {
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
    const res = await fetch(`${getServerApiBaseUrl()}/v1/listings/${id}/price-history`, {
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
    const res = await fetch(`${getServerApiBaseUrl()}/v1/listings/${id}/safety`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data: SafetyData }
    return json.data
  } catch {
    return null
  }
}

async function getMarketPricing(make: string, model: string, year: number): Promise<MarketPricing | null> {
  try {
    const url = new URL(`${getServerApiBaseUrl()}/v1/market/pricing`)
    url.searchParams.set('make', make)
    url.searchParams.set('model', model)
    url.searchParams.set('year', String(year))
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = (await res.json()) as { data: MarketPricing }
    return json.data
  } catch {
    return null
  }
}

async function getSimilar(make: string, model: string, year: number, excludeId: string): Promise<SimilarListing[]> {
  try {
    const url = new URL(`${getServerApiBaseUrl()}/v1/listings`)
    url.searchParams.set('make', make)
    url.searchParams.set('model', model)
    url.searchParams.set('yearMin', String(year - 2))
    url.searchParams.set('yearMax', String(year + 2))
    url.searchParams.set('perPage', '5')
    const res = await fetch(url.toString(), { next: { revalidate: 300 } })
    if (!res.ok) return []
    const json = (await res.json()) as { data: SimilarListing[] }
    return (json.data ?? []).filter((l) => l.id !== excludeId).slice(0, 3)
  } catch {
    return []
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrice(cents: number | null): string {
  if (cents === null) return 'Call for price'
  return `$${(cents / 100).toLocaleString()}`
}

function formatEnum(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function daysListed(listedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(listedAt).getTime()) / 86400000))
}

function estimateMonthly(priceCents: number): number {
  const principal = (priceCents / 100) * 0.8
  const r = 0.065 / 12
  const n = 60
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -n)))
}

const LIFESPAN_MILES: Record<string, number> = {
  toyota: 250000,
  honda: 230000,
  chrysler: 230000,
  ford: 200000,
  gmc: 200000,
  chevrolet: 200000,
  kia: 210000,
  hyundai: 200000,
  dodge: 200000,
}

function getExpectedLifespan(make: string): number {
  return LIFESPAN_MILES[make.toLowerCase()] ?? 200000
}

function conditionLabel(c: string): string {
  if (c === 'certified_pre_owned') return 'CPO'
  if (c === 'used') return 'Used'
  if (c === 'new') return 'New'
  return formatEnum(c)
}

function rampLabel(r: string): string {
  if (r === 'in_floor') return 'In-floor ramp'
  if (r === 'fold_out') return 'Fold-out ramp'
  if (r === 'fold_in') return 'Fold-in ramp'
  return formatEnum(r)
}

function abbreviate(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

function formatK(miles: number): string {
  if (miles >= 1000) return `${Math.round(miles / 1000)}K`
  return String(miles)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Listing not found — WAV Search' }
  const title = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}`
  return {
    title: `${title} — WAV Search`,
    description: `${formatPrice(listing.priceCents)} · ${listing.city && listing.state ? `${listing.city}, ${listing.state} · ` : ''}Wheelchair accessible vehicle`,
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) notFound()

  const [priceHistory, safety, marketPricing, similar] = await Promise.all([
    getPriceHistory(id),
    getSafety(id),
    getMarketPricing(listing.make, listing.model, listing.year),
    getSimilar(listing.make, listing.model, listing.year, id),
  ])

  const vehicleTitle = `${listing.year} ${listing.make} ${listing.model}${listing.trim ? ` ${listing.trim}` : ''}`
  const location = [listing.city, listing.state].filter(Boolean).join(', ')
  const days = daysListed(listing.listedAt)

  // Price drop: first → last history entry
  const firstPricePoint = priceHistory.length >= 2 ? priceHistory[0] : undefined
  const lastPricePoint = priceHistory.length >= 2 ? priceHistory[priceHistory.length - 1] : undefined
  const priceDrop =
    firstPricePoint && lastPricePoint
      ? firstPricePoint.priceCents - lastPricePoint.priceCents
      : null

  // Mileage gauge
  const maxGauge = 300000
  const avgLifespan = getExpectedLifespan(listing.make)
  const mileagePct = listing.mileage !== null ? Math.min((listing.mileage / maxGauge) * 100, 100) : null
  const lifespanPct = Math.min((avgLifespan / maxGauge) * 100, 100)
  const lifeUsedPct =
    listing.mileage !== null ? Math.round((listing.mileage / avgLifespan) * 100) : null

  // Market pricing histogram — use p10/p25/p50/p75/p90 as bucket boundaries
  // Heights approximate a bell curve peaking near median
  const histHeights = [20, 45, 75, 100, 80, 55, 30, 20, 12, 8]
  let currentBucket = -1
  if (listing.priceCents !== null && marketPricing?.priceCents) {
    const mp = marketPricing.priceCents
    const p = listing.priceCents
    if (p < mp.p10) currentBucket = 0
    else if (p < mp.p25) currentBucket = 1
    else if (p < mp.p50) currentBucket = 3
    else if (p < mp.p75) currentBucket = 5
    else if (p < mp.p90) currentBucket = 7
    else currentBucket = 9
  }

  const pctVsMedian =
    listing.priceCents !== null && marketPricing?.priceCents
      ? Math.round(((marketPricing.priceCents.p50 - listing.priceCents) / marketPricing.priceCents.p50) * 100)
      : null

  // Recalls
  const openRecalls = (safety?.recalls ?? []).filter((r) => r.remedy === null || r.remedy.trim() === '')
  const openRecallCount = openRecalls.length

  return (
    <main id="main-content" className={styles.page}>
      <Link href="/filters" className={styles.back}>
        <ChevronLeft size={16} aria-hidden />
        Back to listings
      </Link>

      {/* ── Hero card ── */}
      <div className={styles.hero}>
        <HeroGallery
          images={listing.images}
          alt={vehicleTitle}
          conditionLabel={conditionLabel(listing.condition)}
          daysListed={days}
        />
        <div className={styles.heroInfo}>
          <h1 className={styles.heroTitle}>{vehicleTitle}</h1>
          <div className={styles.heroMeta}>
            {listing.mileage !== null && (
              <span className={styles.heroChip}>
                <Gauge size={11} aria-hidden />
                {listing.mileage.toLocaleString()} mi
              </span>
            )}
            {listing.transmission && (
              <span className={styles.heroChip}>
                <Settings2 size={11} aria-hidden />
                {listing.transmission}
              </span>
            )}
            {listing.fuelType && (
              <span className={styles.heroChip}>
                <TrendingUp size={11} aria-hidden />
                {listing.fuelType}
              </span>
            )}
            {listing.color && (
              <span className={styles.heroChip}>
                <span aria-hidden>◆</span>
                {listing.color}
              </span>
            )}
          </div>
          <div className={styles.heroBottom}>
            <div>
              <div className={styles.heroPrice}>{formatPrice(listing.priceCents)}</div>
              {listing.priceCents !== null && (
                <div className={styles.heroPriceMo}>
                  Est. ${estimateMonthly(listing.priceCents).toLocaleString()}/mo
                </div>
              )}
              {priceDrop !== null && priceDrop > 0 && (
                <div className={styles.heroPriceDrop}>
                  <TrendingDown size={12} aria-hidden />
                  Reduced ${(priceDrop / 100).toLocaleString()} on{' '}
                  {lastPricePoint ? formatDate(lastPricePoint.recordedAt) : ''}
                </div>
              )}
            </div>
            {marketPricing?.medianDaysListed != null && (
              <div className={styles.heroMarketTag}>
                <div className={styles.heroMarketVal}>{marketPricing.medianDaysListed} days</div>
                <div className={styles.heroMarketLabel}>avg time to sell</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CTAs ── */}
      <div className={styles.ctaWrap}>
        <a
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.ctaPrimary}
        >
          <ExternalLink size={16} aria-hidden />
          View original listing
        </a>
        {listing.vin && (
          <Link href={`/vin/${encodeURIComponent(listing.vin)}`} className={styles.ctaSecondary}>
            <ShieldCheck size={16} aria-hidden />
            View safety report
          </Link>
        )}
      </div>

      {/* ── WAV features ── */}
      <div className={styles.section}>
        <Collapsible
          defaultOpen
          greenHeader
          header={
            <>
              <Accessibility size={12} aria-hidden />
              WAV features
            </>
          }
        >
          {listing.conversionType !== 'unknown' && (
            <div className={styles.entryBanner}>
              <span className={styles.entryIcon}>
                {listing.conversionType === 'side_entry' ? (
                  <DoorOpen size={22} aria-hidden />
                ) : (
                  <Truck size={22} aria-hidden />
                )}
              </span>
              <div>
                <div className={styles.entryLabel}>
                  {listing.conversionType === 'side_entry' ? 'Side-entry conversion' : 'Rear-entry conversion'}
                </div>
                <div className={styles.entrySub}>
                  {listing.conversionType === 'side_entry'
                    ? 'Driver or passenger side access'
                    : 'Rear ramp or lift access'}
                </div>
              </div>
            </div>
          )}

          <div className={styles.wavGrid} role="list" aria-label="WAV features">
            <WavFeatureItem
              icon={<MoveDown size={16} aria-hidden />}
              label="Floor lowering"
              value={listing.floorLoweringInches !== null ? `${listing.floorLoweringInches} inches` : null}
            />
            <WavFeatureItem
              icon={<ArrowDownFromLine size={16} aria-hidden />}
              label="Ramp type"
              value={listing.rampType !== 'none' && listing.rampType !== 'unknown' ? rampLabel(listing.rampType) : null}
            />
            <WavFeatureItem
              icon={<Users size={16} aria-hidden />}
              label="WC capacity"
              value={listing.wheelchairCapacity ? `${listing.wheelchairCapacity} chair${listing.wheelchairCapacity > 1 ? 's' : ''}` : null}
            />
            <WavFeatureItem
              icon={<Armchair size={16} aria-hidden />}
              label="Transfer seat"
              value={listing.transferSeat ? 'Included' : null}
            />
            <WavFeatureItem
              icon={<Settings2 size={16} aria-hidden />}
              label="Hand controls"
              value={listing.handControls ? 'Included' : null}
            />
            <WavFeatureItem
              icon={<ArrowUpDown size={16} aria-hidden />}
              label="Lift"
              value={listing.hasLift ? 'Included' : null}
            />
          </div>

          {listing.conversionManufacturer && (
            <div className={styles.convRow}>
              <div className={styles.convLogo} aria-hidden>
                {abbreviate(listing.conversionManufacturer)}
              </div>
              <div>
                <div className={styles.convName}>{listing.conversionManufacturer}</div>
                <div className={styles.convSub}>WAV conversion manufacturer</div>
              </div>
            </div>
          )}
        </Collapsible>
      </div>

      <div className={styles.divider} />

      {/* ── Mileage & lifespan ── */}
      {listing.mileage !== null && (
        <>
          <div className={styles.section}>
            <Collapsible
              defaultOpen
              header={
                <>
                  <Gauge size={12} aria-hidden />
                  Mileage &amp; lifespan
                </>
              }
            >
              <div
                className={styles.gaugeTrack}
                role="img"
                aria-label={`Mileage gauge: ${listing.mileage.toLocaleString()} miles out of ${maxGauge.toLocaleString()} mile scale. Average lifespan for ${listing.make}: ${avgLifespan.toLocaleString()} miles.`}
              >
                {mileagePct !== null && (
                  <div className={styles.gaugeFill} style={{ width: `${mileagePct}%` }} />
                )}
                <div className={styles.gaugeMarker} style={{ left: `${lifespanPct}%` }} />
              </div>
              <div className={styles.gaugeLabels} aria-hidden>
                <span>0</span>
                <span>{formatK(maxGauge * 0.25)}</span>
                <span>{formatK(maxGauge * 0.5)}</span>
                <span>{formatK(maxGauge * 0.75)}</span>
                <span>{formatK(maxGauge)}</span>
              </div>
              <div className={styles.legendRow}>
                <div className={styles.legendItem}>
                  <div className={styles.legendDotOrange} />
                  <span className={styles.legendText}>
                    <strong>{listing.mileage.toLocaleString()} mi</strong> — this vehicle
                  </span>
                </div>
                <div className={styles.legendItem}>
                  <div className={styles.legendDotGreen} />
                  <span className={styles.legendText}>
                    <strong>{avgLifespan.toLocaleString()} mi</strong> — {listing.make} avg lifespan
                  </span>
                </div>
              </div>
              {lifeUsedPct !== null && (
                <div className={styles.greenNote}>
                  <Check size={13} aria-hidden />
                  {lifeUsedPct}% of expected life used
                  {lifeUsedPct < 50 ? ' — strong longevity ahead' : lifeUsedPct < 80 ? ' — solid remaining mileage' : ' — higher mileage vehicle'}
                </div>
              )}
            </Collapsible>
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* ── Price vs. market ── */}
      {marketPricing && marketPricing.count >= 3 && marketPricing.priceCents && (
        <>
          <div className={styles.section}>
            <Collapsible
              defaultOpen
              header={
                <>
                  <TrendingUp size={12} aria-hidden />
                  Price vs. market
                </>
              }
            >
              <div
                className={styles.histBars}
                role="img"
                aria-label={`Price distribution for ${listing.make} ${listing.model} WAVs. Median price: ${formatPrice(marketPricing.priceCents.p50)}.`}
              >
                {histHeights.map((h, i) => (
                  <div
                    key={i}
                    className={styles.hBar}
                    style={{
                      height: `${h}%`,
                      background: i === currentBucket ? 'var(--clr-primary)' : 'var(--clr-border)',
                    }}
                  />
                ))}
              </div>
              <div className={styles.histLabels} aria-hidden>
                <span>{formatPrice(marketPricing.priceCents.p10)}</span>
                <span>{formatPrice(marketPricing.priceCents.p25)}</span>
                <span>{formatPrice(marketPricing.priceCents.p50)}</span>
                <span>{formatPrice(marketPricing.priceCents.p75)}</span>
                <span>{formatPrice(marketPricing.priceCents.p90)}+</span>
              </div>
              {pctVsMedian !== null && (
                <div className={pctVsMedian >= 0 ? styles.priceNote : styles.priceNoteAbove}>
                  {pctVsMedian >= 0 ? (
                    <TrendingDown size={13} aria-hidden />
                  ) : (
                    <TrendingUp size={13} aria-hidden />
                  )}
                  {pctVsMedian >= 0
                    ? `${pctVsMedian}% below median`
                    : `${Math.abs(pctVsMedian)}% above median`}{' '}
                  — comparable {listing.make} {listing.model} WAVs list at{' '}
                  {formatPrice(marketPricing.priceCents.p50)} median ({marketPricing.count} listings)
                </div>
              )}
            </Collapsible>
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* ── Recalls & VIN history ── */}
      <div className={styles.section}>
        <Collapsible
          defaultOpen
          header={
            <>
              <AlertTriangle size={12} aria-hidden />
              Recalls &amp; VIN history
              {openRecallCount > 0 && (
                <span className={styles.recallBadge} role="status" aria-label={`${openRecallCount} open recall${openRecallCount > 1 ? 's' : ''}`}>
                  {openRecallCount} open
                </span>
              )}
            </>
          }
        >
          {listing.vin && (
            <div className={styles.vinRow}>
              <span className={styles.vinKey}>VIN</span>
              <span className={styles.vinValMono}>{listing.vin}</span>
            </div>
          )}

          {safety === null || safety.vehicleModel === null ? (
            <p className={styles.safetyPlaceholder}>
              Safety data not yet available for this vehicle. Check back after the next NHTSA sync.
            </p>
          ) : openRecalls.length === 0 ? (
            <div className={styles.noRecalls}>
              <Check size={14} aria-hidden />
              No open recalls found for {safety.vehicleModel.year} {safety.vehicleModel.make} {safety.vehicleModel.model}
            </div>
          ) : (
            <ul className={styles.recallList} aria-label="Recall campaigns">
              {safety.recalls.map((recall) => {
                const isOpen = !recall.remedy || recall.remedy.trim() === ''
                return (
                  <li key={recall.id} className={styles.recallItem}>
                    <div className={isOpen ? styles.recallIconWarn : styles.recallIconOk} aria-hidden>
                      {isOpen ? <AlertTriangle size={14} /> : <Check size={14} />}
                    </div>
                    <div>
                      <div className={styles.recallTitle}>
                        NHTSA #{recall.nhtsaCampaignId} · {recall.component}
                      </div>
                      <div className={styles.recallSub}>
                        Issued {formatDate(recall.reportedAt)}
                      </div>
                      {recall.summary && (
                        <div className={styles.recallSub}>{recall.summary}</div>
                      )}
                      <span className={isOpen ? styles.recallStatusOpen : styles.recallStatusDone}>
                        {isOpen ? 'Remedy open — schedule service' : 'Completed'}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Collapsible>
      </div>

      <div className={styles.divider} />

      {/* ── Owner satisfaction ── */}
      <div className={styles.section}>
        <Collapsible
          defaultOpen={false}
          header={
            <>
              <Star size={12} aria-hidden />
              Owner satisfaction
            </>
          }
        >
          {(() => {
            const rating = safety?.safetyRatings?.[0]
            return rating != null ? (
              <>
                <div className={styles.satRow}>
                  <div className={styles.satCard}>
                    <div className={styles.satScore}>
                      {rating.overallRating ?? '—'}
                      <span className={styles.satDenom}>/5</span>
                    </div>
                    <div className={styles.satLabel}>NHTSA overall safety rating</div>
                  </div>
                  {rating.frontCrashRating !== null && (
                    <div className={styles.satCard}>
                      <div className={styles.satScore}>
                        {rating.frontCrashRating}
                        <span className={styles.satDenom}>/5</span>
                      </div>
                      <div className={styles.satLabel}>Front crash rating</div>
                    </div>
                  )}
                </div>
                {rating.overallRating !== null && (
                  <>
                    <div className={styles.barRow}>
                      <div className={styles.barLbl}>Overall</div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${(rating.overallRating / 5) * 100}%` }} />
                      </div>
                      <div className={styles.barVal}>{rating.overallRating}</div>
                    </div>
                    {rating.frontCrashRating !== null && (
                      <div className={styles.barRow}>
                        <div className={styles.barLbl}>Front crash</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(rating.frontCrashRating / 5) * 100}%` }} />
                        </div>
                        <div className={styles.barVal}>{rating.frontCrashRating}</div>
                      </div>
                    )}
                    {rating.sideCrashRating !== null && (
                      <div className={styles.barRow}>
                        <div className={styles.barLbl}>Side crash</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(rating.sideCrashRating / 5) * 100}%` }} />
                        </div>
                        <div className={styles.barVal}>{rating.sideCrashRating}</div>
                      </div>
                    )}
                    {rating.rolloverRating !== null && (
                      <div className={styles.barRow}>
                        <div className={styles.barLbl}>Rollover</div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${(rating.rolloverRating / 5) * 100}%` }} />
                        </div>
                        <div className={styles.barVal}>{rating.rolloverRatingText ?? rating.rolloverRating}</div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className={styles.satPlaceholder}>
                No NHTSA safety ratings available for this vehicle yet.
              </p>
            )
          })()}
        </Collapsible>
      </div>

      <div className={styles.divider} />

      {/* ── Dealer ── */}
      {(listing.dealerName || listing.dealerPhone || listing.dealerWebsite) && (
        <>
          <div className={styles.section}>
            <div className={styles.dealerHeader}>
              <div>
                <div className={styles.dealerName}>{listing.dealerName ?? 'Dealer'}</div>
                <div className={styles.dealerSpec}>
                  {listing.sellerType === 'dealer' ? 'Dealership' : 'Private seller'}
                </div>
              </div>
            </div>
            <ul className={styles.dealerContactList}>
              {location && (
                <li className={styles.dealerContactRow}>
                  <MapPin size={16} className={styles.dealerContactIcon} aria-hidden />
                  {location}
                  {listing.zip ? ` ${listing.zip}` : ''}
                </li>
              )}
              {listing.dealerPhone && (
                <li className={styles.dealerContactRow}>
                  <Phone size={16} className={styles.dealerContactIcon} aria-hidden />
                  <a href={`tel:${listing.dealerPhone}`} className={styles.dealerLink}>
                    {listing.dealerPhone}
                  </a>
                </li>
              )}
              {listing.dealerWebsite && (
                <li className={styles.dealerContactRow}>
                  <Globe size={16} className={styles.dealerContactIcon} aria-hidden />
                  <a
                    href={/^https?:\/\//.test(listing.dealerWebsite) ? listing.dealerWebsite : `https://${listing.dealerWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.dealerLink}
                  >
                    {listing.dealerWebsite.replace(/^https?:\/\//, '')}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* ── Location ── */}
      {(listing.city || listing.state || listing.zip) && (
        <>
          <div className={styles.section}>
            <Collapsible
              defaultOpen
              header={
                <>
                  <MapPin size={12} aria-hidden />
                  Location
                </>
              }
            >
              <div className={styles.mapBlock} aria-hidden>
                <div className={styles.mapRing} />
                <div className={styles.mapDot} />
                <div className={styles.mapCity}>
                  <MapPin size={11} aria-hidden />
                  {[listing.city, listing.state, listing.zip].filter(Boolean).join(', ')}
                </div>
              </div>
              <p className={styles.locMeta}>
                <span className={styles.locMetaItem}>
                  <Building2 size={12} aria-hidden />
                  {location}
                  {listing.zip ? ` ${listing.zip}` : ''}
                </span>
              </p>
            </Collapsible>
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* ── Similar WAVs ── */}
      {similar.length > 0 && (
        <>
          <div className={styles.section}>
            <Collapsible
              defaultOpen
              header={
                <>
                  <Building2 size={12} aria-hidden />
                  Similar WAVs
                </>
              }
            >
              <ul className={styles.similarList}>
                {similar.map((s) => {
                  const simDays = daysListed(s.listedAt)
                  const simMeta = [
                    s.rampType !== 'none' && s.rampType !== 'unknown' ? rampLabel(s.rampType) : null,
                    s.conversionManufacturer ?? null,
                    s.mileage !== null ? `${s.mileage.toLocaleString()} mi` : null,
                    simDays > 0 ? `${simDays}d listed` : 'Listed today',
                  ]
                    .filter(Boolean)
                    .join(' · ')

                  return (
                    <li key={s.id}>
                      <Link href={`/listings/${s.id}`} className={styles.similarItem}>
                        <div>
                          <div className={styles.simName}>
                            {s.year} {s.make} {s.model}
                            {s.condition === 'new' && (
                              <span className={styles.simCondBadge}>New</span>
                            )}
                          </div>
                          {simMeta && <div className={styles.simMeta}>{simMeta}</div>}
                        </div>
                        <div className={styles.simRight}>
                          <div className={styles.simPrice}>{formatPrice(s.priceCents)}</div>
                          {(s.city || s.state) && (
                            <div className={styles.simLoc}>
                              {[s.city, s.state].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              <Link
                href={`/filters?make=${encodeURIComponent(listing.make)}&model=${encodeURIComponent(listing.model)}`}
                className={styles.seeAllBtn}
              >
                See all similar {listing.make} {listing.model} listings →
              </Link>
            </Collapsible>
          </div>
          <div className={styles.divider} />
        </>
      )}

      <p className={styles.footerMeta}>
        Listed {formatDate(listing.listedAt)} · Updated {formatDate(listing.updatedAt)}
      </p>
    </main>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function WavFeatureItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  const included = value !== null
  return (
    <div role="listitem" className={included ? styles.wavItem : styles.wavItemOff}>
      <div className={included ? styles.wavIcon : styles.wavIconOff}>{icon}</div>
      <div className={included ? styles.wavLbl : styles.wavLblOff}>{label}</div>
      <div className={included ? styles.wavVal : styles.wavValOff}>
        {value ?? 'Not included'}
      </div>
    </div>
  )
}
