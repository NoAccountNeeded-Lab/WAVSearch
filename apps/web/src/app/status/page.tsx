import Link from 'next/link'
import { getPublicApiBaseUrl } from '@/lib/api-url'
import { StatusDashboard } from './StatusDashboard'
import styles from './page.module.css'

export default function StatusPage() {
  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.logo} aria-label="WAV Search — go to home">
            <span className={styles.logoAccent}>WAV</span> Search
          </Link>
          <span className={styles.divider} aria-hidden="true">/</span>
          <span className={styles.sectionText}>System Status</span>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <div className={styles.container}>
          <StatusDashboard apiBaseUrl={getPublicApiBaseUrl()} />
        </div>
      </main>
    </>
  )
}
