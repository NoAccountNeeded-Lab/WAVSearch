import { Globe, MapPin, Phone } from 'lucide-react'
import styles from './DealerCard.module.css'

interface DealerCardProps {
  dealer: { name: string | null; phone: string | null; website: string | null }
  location: { city: string | null; state: string | null; zip: string | null }
  sellerType: string
}

export function DealerCard({ dealer, location, sellerType }: DealerCardProps) {
  const locationStr = [location.city, location.state].filter(Boolean).join(', ')

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.name}>{dealer.name ?? 'Dealer'}</div>
        <div className={styles.type}>
          {sellerType === 'dealer' ? 'Dealership' : 'Private seller'}
        </div>
      </div>

      <ul className={styles.contactList}>
        {locationStr && (
          <li className={styles.contactRow}>
            <MapPin size={16} className={styles.contactIcon} aria-hidden />
            {locationStr}
            {location.zip ? ` ${location.zip}` : ''}
          </li>
        )}
        {dealer.phone && (
          <li className={styles.contactRow}>
            <Phone size={16} className={styles.contactIcon} aria-hidden />
            <a href={`tel:${dealer.phone}`} className={styles.link}>
              {dealer.phone}
            </a>
          </li>
        )}
        {dealer.website && (
          <li className={styles.contactRow}>
            <Globe size={16} className={styles.contactIcon} aria-hidden />
            <a
              href={/^https?:\/\//.test(dealer.website) ? dealer.website : `https://${dealer.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {dealer.website.replace(/^https?:\/\//, '')}
            </a>
          </li>
        )}
      </ul>
    </div>
  )
}
