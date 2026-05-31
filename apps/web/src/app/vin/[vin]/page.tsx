import Link from 'next/link'
import type { Metadata } from 'next'
import { AlertTriangle, CheckCircle2, ChevronLeft, ShieldCheck, Star } from 'lucide-react'
import { getServerApiBaseUrl } from '@/lib/api-url'
import { VinSearchForm } from '../VinSearchForm'
import styles from '../page.module.css'

interface DecodedVin {
  make: string
  model: string
  year: number
  trim: string | null
  bodyType: string | null
}

interface Recall {
  id: string
  nhtsaCampaignId: string
  component: string
  summary: string
  remedy: string | null
  reportedAt: string
}

interface ComplaintExample {
  id: string
  nhtsaId: string
  summary: string
  mileage: number | null
  crashInvolved: boolean
  reportedAt: string
}

interface ComplaintGroup {
  component: string
  count: number
  examples: ComplaintExample[]
}

interface SafetyRating {
  id: string
  nhtsaVehicleId: number
  description: string | null
  overallRating: number | null
  frontCrashRating: number | null
  sideCrashRating: number | null
  rolloverRating: number | null
  rolloverRatingText: string | null
}

interface VinSafetyReport {
  vin: string
  decoded: DecodedVin | null
  vehicleModel: DecodedVin & { id: string } | null
  conversionManufacturer: string | null
  sourceListingId: string | null
  recalls: Recall[]
  complaintGroups: ComplaintGroup[]
  safetyRatings: SafetyRating[]
  checkedAt: string
}

interface ApiError {
  code: string
  message: string
}

async function getVinReport(vin: string): Promise<{ data: VinSafetyReport | null; error: ApiError | null }> {
  const res = await fetch(`${getServerApiBaseUrl()}/v1/vin/${encodeURIComponent(vin)}/safety`, {
    next: { revalidate: 86400 },
  })
  const json = (await res.json()) as { data?: VinSafetyReport; error?: ApiError }

  if (!res.ok) return { data: null, error: json.error ?? { code: 'VIN_LOOKUP_FAILED', message: 'Could not check this VIN.' } }
  return { data: json.data ?? null, error: null }
}

export async function generateMetadata({ params }: { params: Promise<{ vin: string }> }): Promise<Metadata> {
  const { vin } = await params
  return {
    title: `${vin.toUpperCase()} Safety Report — WAV Search`,
    description: 'NHTSA recall, complaint, and safety rating summary for this VIN.',
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatRating(value: number | null): string {
  return value === null ? 'Not rated' : `${value}/5`
}

function vehicleName(decoded: DecodedVin): string {
  return `${decoded.year} ${decoded.make} ${decoded.model}${decoded.trim ? ` ${decoded.trim}` : ''}`
}

export default async function VinReportPage({ params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params
  const normalizedVin = vin.toUpperCase()
  const { data: report, error } = await getVinReport(normalizedVin)

  return (
    <main id="main-content" className={styles.page}>
      <Link href="/filters" className={styles.back}>
        <ChevronLeft size={16} aria-hidden />
        Back to listings
      </Link>

      <header className={styles.header}>
        <p className={styles.eyebrow}>NHTSA Safety Lookup</p>
        <h1 className={styles.title}>VIN safety report</h1>
        <p className={styles.lede}>{normalizedVin}</p>
        <VinSearchForm initialVin={normalizedVin} />
      </header>

      {error && (
        <section className={styles.section} aria-labelledby="vin-error-heading">
          <h2 className={styles.sectionTitle} id="vin-error-heading">Lookup issue</h2>
          <div className={`${styles.notice} ${styles.warningNotice}`}>
            <strong>{error.message}</strong> Check that the VIN is 17 characters and does not contain I, O, or Q.
          </div>
        </section>
      )}

      {report && !report.decoded && (
        <section className={styles.section} aria-labelledby="vin-unknown-heading">
          <h2 className={styles.sectionTitle} id="vin-unknown-heading">No decoded vehicle</h2>
          <div className={styles.notice}>
            <strong>WAV Search could not decode this VIN through NHTSA.</strong> Check the VIN for typos or try another vehicle.
          </div>
        </section>
      )}

      {report?.decoded && (
        <>
          <section className={styles.section} aria-labelledby="summary-heading">
            <h2 className={styles.sectionTitle} id="summary-heading">Summary</h2>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Decoded vehicle</span>
                <span className={styles.summaryValue}>
                  <ShieldCheck size={18} aria-hidden />
                  {vehicleName(report.decoded)}
                </span>
                {report.decoded.bodyType && <span className={styles.summaryDetail}>{report.decoded.bodyType}</span>}
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Recall campaigns</span>
                <span className={styles.summaryValue}>
                  {report.recalls.length > 0 ? <AlertTriangle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
                  {report.recalls.length}
                </span>
                <span className={styles.summaryDetail}>Checked {formatDate(report.checkedAt)}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Overall rating</span>
                <span className={styles.summaryValue}>
                  <Star size={18} aria-hidden />
                  {report.safetyRatings[0] ? formatRating(report.safetyRatings[0].overallRating) : 'Not rated'}
                </span>
                <span className={styles.summaryDetail}>NHTSA safety rating when available</span>
              </div>
            </div>
          </section>

          {report.conversionManufacturer && (
            <section className={styles.section} aria-labelledby="conversion-heading">
              <h2 className={styles.sectionTitle} id="conversion-heading">WAV conversion context</h2>
              <div className={styles.notice}>
                This VIN matches a WAV listing with a <strong>{report.conversionManufacturer}</strong> conversion.
                {report.sourceListingId && (
                  <>
                    {' '}
                    <Link className={styles.link} href={`/filters/${report.sourceListingId}`}>View the source listing.</Link>
                  </>
                )}
              </div>
            </section>
          )}

          <section className={styles.section} aria-labelledby="recalls-heading">
            <h2 className={styles.sectionTitle} id="recalls-heading">Recall campaigns</h2>
            {report.recalls.length === 0 ? (
              <div className={styles.notice}>
                <strong>No open recalls found</strong> in WAV Search safety data for this decoded vehicle model as of {formatDate(report.checkedAt)}.
              </div>
            ) : (
              <ul className={styles.recallList}>
                {report.recalls.map((recall) => (
                  <li key={recall.id} className={styles.recallItem}>
                    <div className={styles.itemHeader}>
                      <h3 className={styles.itemTitle}>{recall.component}</h3>
                      <span className={styles.badge}>{recall.nhtsaCampaignId}</span>
                    </div>
                    <p className={styles.itemMeta}>Reported {formatDate(recall.reportedAt)}</p>
                    <p className={styles.itemText}>{recall.summary}</p>
                    {recall.remedy && <p className={styles.itemText}><strong>Remedy:</strong> {recall.remedy}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section} aria-labelledby="complaints-heading">
            <h2 className={styles.sectionTitle} id="complaints-heading">Complaint patterns</h2>
            {report.complaintGroups.length === 0 ? (
              <div className={styles.notice}>No NHTSA complaints are stored for this decoded vehicle model yet.</div>
            ) : (
              <ul className={styles.complaintList}>
                {report.complaintGroups.map((group) => (
                  <li key={group.component} className={styles.complaintItem}>
                    <div className={styles.itemHeader}>
                      <h3 className={styles.itemTitle}>{group.component}</h3>
                      <span className={styles.badge}>{group.count} complaint{group.count === 1 ? '' : 's'}</span>
                    </div>
                    <ul className={styles.exampleList}>
                      {group.examples.map((example) => (
                        <li key={example.id}>
                          {example.summary}
                          {example.mileage !== null ? ` (${example.mileage.toLocaleString()} miles)` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section} aria-labelledby="ratings-heading">
            <h2 className={styles.sectionTitle} id="ratings-heading">Safety ratings</h2>
            {report.safetyRatings.length === 0 ? (
              <div className={styles.notice}>No NHTSA safety rating is stored for this decoded vehicle model yet.</div>
            ) : (
              <ul className={styles.ratingList}>
                {report.safetyRatings.map((rating) => (
                  <li key={rating.id} className={styles.ratingItem}>
                    <h3 className={styles.itemTitle}>{rating.description ?? 'NHTSA safety rating'}</h3>
                    <div className={styles.ratingGrid}>
                      <RatingMetric label="Overall" value={formatRating(rating.overallRating)} />
                      <RatingMetric label="Front crash" value={formatRating(rating.frontCrashRating)} />
                      <RatingMetric label="Side crash" value={formatRating(rating.sideCrashRating)} />
                      <RatingMetric label="Rollover" value={rating.rolloverRatingText ?? formatRating(rating.rolloverRating)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}

function RatingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.ratingMetric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  )
}
