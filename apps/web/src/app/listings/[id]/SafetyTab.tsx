import { AlertTriangle } from 'lucide-react'
import { RecallsList } from '@/components/listing/RecallsList'
import { SafetyRatings } from '@/components/listing/SafetyRatings'
import type { ListingDetail, SafetyData } from './types'
import styles from './tabs.module.css'

interface SafetyTabProps {
  listing: ListingDetail
  safety: SafetyData | null
}

export function SafetyTab({ listing, safety }: SafetyTabProps) {
  const openRecallCount = (safety?.recalls ?? []).filter(
    (r) => !r.remedy || r.remedy.trim() === '',
  ).length

  const rating = safety?.safetyRatings?.[0]

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionLabelRow}>
          <AlertTriangle size={12} aria-hidden />
          Recalls &amp; VIN history
          {openRecallCount > 0 && (
            <span
              className={styles.recallBadge}
              role="status"
              aria-label={`${openRecallCount} open recall${openRecallCount > 1 ? 's' : ''}`}
            >
              {openRecallCount} open
            </span>
          )}
        </div>
        <RecallsList vin={listing.vin} safety={safety} />
      </div>

      {rating != null && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>NHTSA safety ratings</div>
          <SafetyRatings rating={rating} />
        </div>
      )}

      {rating == null && safety !== null && (
        <p className={styles.placeholder}>
          No NHTSA safety ratings available for this vehicle yet.
        </p>
      )}
    </div>
  )
}
