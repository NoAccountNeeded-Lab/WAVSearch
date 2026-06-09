import { Globe, MapPin, Phone } from 'lucide-react'
import styles from './DealerCard.module.css'

interface DealerCardProps {
  dealerName: string | null
  dealerPhone: string | null
  dealerWebsite: string | null
  sellerType: string
  city: string | null
  state: string | null
  zip: string | null
}

export function DealerCard({ dealerName, dealerPhone, dealerWebsite, sellerType, city, state, zip }: DealerCardProps) {
  const location = [city, state].filter(Boolean).join(', ')

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.name}>{dealerName ?? 'Dealer'}</div>
        <div className={styles.type}>
          {sellerType === 'dealer' ? 'Dealership' : 'Private seller'}
        </div>
      </div>

      <ul className={styles.contactList}>
        {location && (
          <li className={styles.contactRow}>
            <MapPin size={16} className={styles.contactIcon} aria-hidden />
            {location}
            {zip ? ` ${zip}` : ''}
          </li>
        )}
        {dealerPhone && (
          <li className={styles.contactRow}>
            <Phone size={16} className={styles.contactIcon} aria-hidden />
            <a href={`tel:${dealerPhone}`} className={styles.link}>
              {dealerPhone}
            </a>
          </li>
        )}
        {dealerWebsite && (
          <li className={styles.contactRow}>
            <Globe size={16} className={styles.contactIcon} aria-hidden />
            <a
              href={/^https?:\/\//.test(dealerWebsite) ? dealerWebsite : `https://${dealerWebsite}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {dealerWebsite.replace(/^https?:\/\//, '')}
            </a>
          </li>
        )}
      </ul>
    </div>
  )
}
