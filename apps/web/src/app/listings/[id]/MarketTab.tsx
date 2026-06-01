import { MarketComparison } from '@/components/listing/MarketComparison'
import { SimilarListings } from '@/components/listing/SimilarListings'
import type { ListingDetail, MarketPricing, PricePoint, SimilarListing } from './types'
import styles from './tabs.module.css'

interface MarketTabProps {
  listing: ListingDetail
  marketPricing: MarketPricing | null
  priceHistory: PricePoint[]
  similar: SimilarListing[]
}

export function MarketTab({ listing, marketPricing, priceHistory, similar }: MarketTabProps) {
  const hasMarket = marketPricing && marketPricing.count >= 3 && marketPricing.priceCents

  return (
    <div className={styles.tabContent}>
      {hasMarket ? (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Price vs. market</div>
          <MarketComparison
            priceCents={listing.priceCents}
            make={listing.make}
            model={listing.model}
            marketPricing={marketPricing}
            priceHistory={priceHistory}
          />
          {marketPricing.medianDaysListed != null && (
            <div className={styles.marketStat}>
              <span className={styles.marketStatVal}>{marketPricing.medianDaysListed} days</span>
              <span className={styles.marketStatLabel}>avg time to sell</span>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.placeholder}>
          Not enough comparable listings to show market data yet.
        </p>
      )}

      {similar.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Similar WAVs</div>
          <SimilarListings listings={similar} make={listing.make} model={listing.model} />
        </div>
      )}
    </div>
  )
}
