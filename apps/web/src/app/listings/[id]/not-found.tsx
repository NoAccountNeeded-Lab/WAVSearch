import Link from 'next/link'
import styles from './not-found.module.css'

export default function ListingNotFound() {
  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.card}>
        <p className={styles.message}>
          <strong>Listing unavailable.</strong> It may have been removed or the URL may be incorrect.
        </p>
        <Link href="/filters" className={styles.cta}>
          Browse all listings
        </Link>
      </div>
    </main>
  )
}
