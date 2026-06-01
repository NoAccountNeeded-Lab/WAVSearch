import Link from 'next/link'
import {
  ExternalLink,
  Gauge,
  MapPin,
  Settings2,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { DealerCard } from '@/components/listing/DealerCard'
import {
  conditionLabel,
  daysListed,
  estimateMonthly,
  formatDate,
  formatPrice,
} from './utils'
import type { ListingDetail, PricePoint } from './types'
import styles from './tabs.module.css'

interface OverviewTabProps {
  listing: ListingDetail
  priceHistory: PricePoint[]
}

export function OverviewTab({ listing, priceHistory }: OverviewTabProps) {
  const days = daysListed(listing.listedAt)
  const firstPoint = priceHistory.length >= 2 ? priceHistory[0] : undefined
  const lastPoint = priceHistory.length >= 2 ? priceHistory[priceHistory.length - 1] : undefined
  const priceDrop = firstPoint && lastPoint ? firstPoint.priceCents - lastPoint.priceCents : null
  const hasDealerInfo = listing.dealerName ?? listing.dealerPhone ?? listing.dealerWebsite

  return (
    <div className={styles.tabContent}>
      {/* Price block */}
      <div className={styles.priceBlock}>
        <div className={styles.price}>{formatPrice(listing.priceCents)}</div>
        {listing.priceCents !== null && (
          <div className={styles.priceMo}>
            Est. ${estimateMonthly(listing.priceCents).toLocaleString()}/mo
          </div>
        )}
        {priceDrop !== null && priceDrop > 0 && lastPoint && (
          <div className={styles.priceDrop}>
            <TrendingDown size={12} aria-hidden />
            Reduced ${(priceDrop / 100).toLocaleString()} on {formatDate(lastPoint.recordedAt)}
          </div>
        )}
      </div>

      {/* Condition + days pills */}
      <div className={styles.pills}>
        <span className={styles.conditionPill}>{conditionLabel(listing.condition)}</span>
        <span className={styles.daysPill}>
          {days === 0 ? 'Listed today' : `${days} day${days === 1 ? '' : 's'} listed`}
        </span>
      </div>

      {/* Specs chips */}
      <div className={styles.chips}>
        {listing.mileage !== null && (
          <span className={styles.chip}>
            <Gauge size={11} aria-hidden />
            {listing.mileage.toLocaleString()} mi
          </span>
        )}
        {listing.transmission && (
          <span className={styles.chip}>
            <Settings2 size={11} aria-hidden />
            {listing.transmission}
          </span>
        )}
        {listing.fuelType && (
          <span className={styles.chip}>
            <TrendingUp size={11} aria-hidden />
            {listing.fuelType}
          </span>
        )}
        {listing.color && (
          <span className={styles.chip}>
            <span aria-hidden>◆</span>
            {listing.color}
          </span>
        )}
        {([listing.city, listing.state].filter(Boolean).length > 0) && (
          <span className={styles.chip}>
            <MapPin size={11} aria-hidden />
            {[listing.city, listing.state].filter(Boolean).join(', ')}
          </span>
        )}
      </div>

      {/* CTAs */}
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

      {/* Dealer info */}
      {hasDealerInfo && (
        <div className={styles.section}>
          <DealerCard
            dealerName={listing.dealerName}
            dealerPhone={listing.dealerPhone}
            dealerWebsite={listing.dealerWebsite}
            sellerType={listing.sellerType}
            city={listing.city}
            state={listing.state}
            zip={listing.zip}
          />
        </div>
      )}

      <p className={styles.footerMeta}>
        Listed {formatDate(listing.listedAt)} · Updated {formatDate(listing.updatedAt)}
      </p>
    </div>
  )
}
