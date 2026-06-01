import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatPrice, formatDate } from '@/app/listings/[id]/utils'
import type { MarketPricing, PricePoint } from '@/app/listings/[id]/types'
import styles from './MarketComparison.module.css'

interface MarketComparisonProps {
  priceCents: number | null
  make: string
  model: string
  marketPricing: MarketPricing
  priceHistory: PricePoint[]
}

// Approximate bell-curve heights peaking near median
const HIST_HEIGHTS = [20, 45, 75, 100, 80, 55, 30, 20, 12, 8]

export function MarketComparison({ priceCents, make, model, marketPricing, priceHistory }: MarketComparisonProps) {
  const mp = marketPricing.priceCents
  if (!mp) return null

  let currentBucket = -1
  if (priceCents !== null) {
    if (priceCents < mp.p10) currentBucket = 0
    else if (priceCents < mp.p25) currentBucket = 1
    else if (priceCents < mp.p50) currentBucket = 3
    else if (priceCents < mp.p75) currentBucket = 5
    else if (priceCents < mp.p90) currentBucket = 7
    else currentBucket = 9
  }

  const pctVsMedian =
    priceCents !== null
      ? Math.round(((mp.p50 - priceCents) / mp.p50) * 100)
      : null

  const firstPoint = priceHistory.length >= 2 ? priceHistory[0] : undefined
  const lastPoint = priceHistory.length >= 2 ? priceHistory[priceHistory.length - 1] : undefined
  const priceDrop = firstPoint && lastPoint ? firstPoint.priceCents - lastPoint.priceCents : null

  return (
    <div>
      {/* Histogram */}
      <div
        className={styles.bars}
        role="img"
        aria-label={`Price distribution for ${make} ${model} WAVs. Median price: ${formatPrice(mp.p50)}.`}
      >
        {HIST_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className={styles.bar}
            style={{
              height: `${h}%`,
              background: i === currentBucket ? 'var(--clr-primary)' : 'var(--clr-border)',
            }}
          />
        ))}
      </div>

      <div className={styles.labels} aria-hidden>
        <span>{formatPrice(mp.p10)}</span>
        <span>{formatPrice(mp.p25)}</span>
        <span>{formatPrice(mp.p50)}</span>
        <span>{formatPrice(mp.p75)}</span>
        <span>{formatPrice(mp.p90)}+</span>
      </div>

      {pctVsMedian !== null && (
        <div className={pctVsMedian >= 0 ? styles.noteBelow : styles.noteAbove}>
          {pctVsMedian >= 0 ? <TrendingDown size={13} aria-hidden /> : <TrendingUp size={13} aria-hidden />}
          {pctVsMedian >= 0
            ? `${pctVsMedian}% below median`
            : `${Math.abs(pctVsMedian)}% above median`}{' '}
          — comparable {make} {model} WAVs list at {formatPrice(mp.p50)} median ({marketPricing.count} listings)
        </div>
      )}

      {/* Price drop history */}
      {priceDrop !== null && priceDrop > 0 && lastPoint && (
        <div className={styles.priceDrop}>
          <TrendingDown size={13} aria-hidden />
          Price reduced ${(priceDrop / 100).toLocaleString()} on {formatDate(lastPoint.recordedAt)}
        </div>
      )}
    </div>
  )
}
