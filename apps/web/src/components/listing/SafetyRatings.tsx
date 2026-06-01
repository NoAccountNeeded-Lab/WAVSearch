import type { SafetyRating } from '@/app/listings/[id]/types'
import styles from './SafetyRatings.module.css'

interface SafetyRatingsProps {
  rating: SafetyRating
}

const RATING_ROWS: { key: keyof SafetyRating; label: string }[] = [
  { key: 'overallRating', label: 'Overall' },
  { key: 'frontCrashRating', label: 'Front crash' },
  { key: 'sideCrashRating', label: 'Side crash' },
  { key: 'rolloverRating', label: 'Rollover' },
]

export function SafetyRatings({ rating }: SafetyRatingsProps) {
  return (
    <div>
      <div className={styles.scoreRow}>
        {rating.overallRating != null && (
          <div className={styles.scoreCard}>
            <div className={styles.score}>
              {rating.overallRating}
              <span className={styles.denom}>/5</span>
            </div>
            <div className={styles.scoreLabel}>NHTSA overall safety rating</div>
          </div>
        )}
        {rating.frontCrashRating != null && (
          <div className={styles.scoreCard}>
            <div className={styles.score}>
              {rating.frontCrashRating}
              <span className={styles.denom}>/5</span>
            </div>
            <div className={styles.scoreLabel}>Front crash rating</div>
          </div>
        )}
      </div>

      {RATING_ROWS.map(({ key, label }) => {
        const raw = rating[key]
        if (raw === null || raw === undefined) return null
        const value = typeof raw === 'number' ? raw : null
        if (value === null) return null
        const displayVal = key === 'rolloverRating' ? (rating.rolloverRatingText ?? value) : value
        return (
          <div key={key} className={styles.barRow}>
            <div className={styles.barLabel}>{label}</div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${(value / 5) * 100}%` }} />
            </div>
            <div className={styles.barValue}>{displayVal}</div>
          </div>
        )
      })}
    </div>
  )
}
