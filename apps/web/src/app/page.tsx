import Link from 'next/link'
import { getServerApiBaseUrl } from '@/lib/api-url'
import styles from './page.module.css'

async function fetchTotalListings(): Promise<number> {
  try {
    const base = getServerApiBaseUrl()
    const url = new URL(`${base}/v1/listings`)
    url.searchParams.set('perPage', '1')
    const res = await fetch(url.toString(), { next: { revalidate: 60 } })
    if (!res.ok) return 0
    const json = (await res.json()) as { pagination?: { total?: number } }
    return json.pagination?.total ?? 0
  } catch {
    return 0
  }
}

export default async function DashboardPage() {
  const total = await fetchTotalListings()

  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <a href="/" className={styles.logo} aria-label="WAV Search — go to home">
            <span className={styles.logoAccent}>WAV</span> Search
          </a>
          <p className={styles.headerTagline}>Wheelchair accessible vehicles</p>
        </div>
      </header>

      <main id="main-content" className={styles.main}>
        <div className={styles.container}>
          <section className={styles.dashboardSection} aria-labelledby="dashboard-heading">
            <h1 id="dashboard-heading" className={styles.dashboardHeading}>
              Dashboard
            </h1>

            <div className={styles.statsGrid}>
              {total > 0 ? (
                <Link href="/filters" className={styles.statCard}>
                  <p className={styles.statValue}>
                    {total.toLocaleString()}
                  </p>
                  <p className={styles.statLabel}>
                    {total === 1 ? 'vehicle' : 'vehicles'}
                  </p>
                  <p className={styles.statCta} aria-hidden="true">
                    Browse vehicles →
                  </p>
                </Link>
              ) : (
                <div className={styles.statCard}>
                  <p className={styles.statValue}>{total.toLocaleString()}</p>
                  <p className={styles.statLabel}>vehicles</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
