import Link from 'next/link'
import styles from './page.module.css'

export default function ListingNotFound() {
  return (
    <main id="main-content" className={styles.page}>
      <Link href="/filters" className={styles.back}>
        ← Back to listings
      </Link>
      <div className={styles.notice} style={{ marginTop: '2rem' }}>
        <strong>Listing not found.</strong> It may have been removed or the URL is incorrect.
      </div>
      <Link href="/filters" className={styles.ctaPrimary} style={{ marginTop: '1rem' }}>
        Browse all listings
      </Link>
    </main>
  )
}
