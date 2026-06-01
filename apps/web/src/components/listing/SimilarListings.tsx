import Link from 'next/link'
import { formatPrice, rampLabel, daysListed } from '@/app/listings/[id]/utils'
import type { SimilarListing } from '@/app/listings/[id]/types'
import styles from './SimilarListings.module.css'

interface SimilarListingsProps {
  listings: SimilarListing[]
  make: string
  model: string
}

export function SimilarListings({ listings, make, model }: SimilarListingsProps) {
  if (listings.length === 0) return null

  return (
    <div>
      <ul className={styles.list}>
        {listings.map((s) => {
          const simDays = daysListed(s.listedAt)
          const metaParts = [
            s.rampType !== 'none' && s.rampType !== 'unknown' ? rampLabel(s.rampType) : null,
            s.conversionManufacturer ?? null,
            s.mileage !== null ? `${s.mileage.toLocaleString()} mi` : null,
            simDays > 0 ? `${simDays}d listed` : 'Listed today',
          ].filter(Boolean).join(' · ')

          return (
            <li key={s.id}>
              <Link href={`/listings/${s.id}`} className={styles.item}>
                <div>
                  <div className={styles.name}>
                    {s.year} {s.make} {s.model}
                    {s.condition === 'new' && (
                      <span className={styles.newBadge}>New</span>
                    )}
                  </div>
                  {metaParts && <div className={styles.meta}>{metaParts}</div>}
                </div>
                <div className={styles.right}>
                  <div className={styles.price}>{formatPrice(s.priceCents)}</div>
                  {(s.city || s.state) && (
                    <div className={styles.location}>
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
        href={`/filters?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`}
        className={styles.seeAll}
      >
        See all similar {make} {model} listings →
      </Link>
    </div>
  )
}
