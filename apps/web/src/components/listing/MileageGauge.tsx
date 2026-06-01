import { Check } from 'lucide-react'
import { getExpectedLifespan, formatK } from '@/app/listings/[id]/utils'
import styles from './MileageGauge.module.css'

interface MileageGaugeProps {
  mileage: number
  make: string
}

const MAX_GAUGE = 300000

export function MileageGauge({ mileage, make }: MileageGaugeProps) {
  const avgLifespan = getExpectedLifespan(make)
  const mileagePct = Math.min((mileage / MAX_GAUGE) * 100, 100)
  const lifespanPct = Math.min((avgLifespan / MAX_GAUGE) * 100, 100)
  const lifeUsedPct = Math.round((mileage / avgLifespan) * 100)

  return (
    <div>
      <div
        className={styles.track}
        role="img"
        aria-label={`Mileage gauge: ${mileage.toLocaleString()} miles out of ${MAX_GAUGE.toLocaleString()} mile scale. Average lifespan for ${make}: ${avgLifespan.toLocaleString()} miles.`}
      >
        <div className={styles.fill} style={{ width: `${mileagePct}%` }} />
        <div className={styles.marker} style={{ left: `${lifespanPct}%` }} />
      </div>

      <div className={styles.scaleLabels} aria-hidden>
        <span>0</span>
        <span>{formatK(MAX_GAUGE * 0.25)}</span>
        <span>{formatK(MAX_GAUGE * 0.5)}</span>
        <span>{formatK(MAX_GAUGE * 0.75)}</span>
        <span>{formatK(MAX_GAUGE)}</span>
      </div>

      <div className={styles.legendRow}>
        <div className={styles.legendItem}>
          <div className={styles.dotOrange} />
          <span className={styles.legendText}>
            <strong>{mileage.toLocaleString()} mi</strong> — this vehicle
          </span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.dotGreen} />
          <span className={styles.legendText}>
            <strong>{avgLifespan.toLocaleString()} mi</strong> — {make} avg lifespan
          </span>
        </div>
      </div>

      <div className={styles.note}>
        <Check size={13} aria-hidden />
        {lifeUsedPct}% of expected life used
        {lifeUsedPct < 50
          ? ' — strong longevity ahead'
          : lifeUsedPct < 80
            ? ' — solid remaining mileage'
            : ' — higher mileage vehicle'}
      </div>
    </div>
  )
}
