import { MileageGauge } from '@/components/listing/MileageGauge'
import type { ListingDetail, ModelResearch, ModelResearchSource } from './types'
import styles from './tabs.module.css'

interface VehicleTabProps {
  listing: ListingDetail
  modelResearch: ModelResearch | null
}

/** Human-readable label for each research claim field. */
const CLAIM_LABELS: Record<string, string> = {
  fuelEconomyCity: 'Fuel economy (city)',
  fuelEconomyHwy: 'Fuel economy (hwy)',
  fuelEconomyCombined: 'Fuel economy (combined)',
  engineDescription: 'Engine',
  drivetrain: 'Drivetrain',
  fuelType: 'Fuel type',
  transmission: 'Transmission',
}

/** Fields shown in the model facts section (ordered). */
const RESEARCH_FIELD_ORDER = [
  'engineDescription',
  'drivetrain',
  'fuelEconomyCombined',
  'fuelEconomyCity',
  'fuelEconomyHwy',
  'fuelType',
  'transmission',
]

export function VehicleTab({ listing, modelResearch }: VehicleTabProps) {
  // Build a map from sourceId → source for inline citation links
  const sourceMap = new Map<string, ModelResearchSource>(
    (modelResearch?.sources ?? []).map((s) => [s.id, s]),
  )

  // Deduplicate: pick the first claim per field in display order
  const researchClaims = RESEARCH_FIELD_ORDER.flatMap((field) => {
    const claim = modelResearch?.claims.find((c) => c.field === field)
    return claim ? [claim] : []
  })

  // Listing-level specs that fill gaps not covered by research claims
  // Avoid showing duplicate info if research already covers it
  const researchedFields = new Set(researchClaims.map((c) => c.field))
  const showListingFuelType = !researchedFields.has('fuelType') && Boolean(listing.fuelType)
  const showListingTransmission = !researchedFields.has('transmission') && Boolean(listing.transmission)

  return (
    <div className={styles.tabContent}>
      {listing.mileage !== null && (
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>Mileage &amp; lifespan</h3>
          <MileageGauge mileage={listing.mileage} make={listing.make} />
        </div>
      )}

      {/* Model facts — cited from EPA / NHTSA */}
      {researchClaims.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>Base model facts</h3>
          <dl className={styles.specList}>
            {researchClaims.map((claim) => {
              const src = claim.sourceId ? sourceMap.get(claim.sourceId) : undefined
              return (
                <div key={claim.id} className={styles.specRow}>
                  <dt className={styles.specLabel}>{CLAIM_LABELS[claim.field] ?? claim.field}</dt>
                  <dd className={styles.specValueCited}>
                    {claim.claimText}
                    {src && (
                      <a
                        href={src.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.citationLink}
                      >
                        {src.sourceName}
                        <span className="sr-only"> (opens in new tab)</span>
                      </a>
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      )}

      {/* Specs table — listing-level data */}
      <div className={styles.section}>
        <h3 className={styles.sectionLabel}>Listing specifications</h3>
        <dl className={styles.specList}>
          {showListingTransmission && listing.transmission && (
            <SpecRow label="Transmission" value={listing.transmission} />
          )}
          {showListingFuelType && listing.fuelType && (
            <SpecRow label="Fuel type" value={listing.fuelType} />
          )}
          {listing.color && <SpecRow label="Exterior color" value={listing.color} />}
          {listing.condition && (
            <SpecRow label="Condition" value={listing.condition.replace(/_/g, ' ')} />
          )}
          {listing.vin && <SpecRow label="VIN" value={listing.vin} mono />}
        </dl>
      </div>
    </div>
  )
}

function SpecRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.specRow}>
      <dt className={styles.specLabel}>{label}</dt>
      <dd className={mono ? styles.specValueMono : styles.specValue}>{value}</dd>
    </div>
  )
}
