import Link from 'next/link'
import { getServerApiBaseUrl } from '@/lib/api-url'
import styles from '../ops.module.css'

interface SourceRow {
  id: string
  name: string
  baseUrl: string
  status: string
  cronExpression: string
  lastScrapedAt: string | null
  listingCount: number
  errorMessage: string | null
}

async function fetchSources(): Promise<SourceRow[]> {
  const res = await fetch(`${getServerApiBaseUrl()}/admin/sources`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const body = (await res.json()) as { data: SourceRow[] }
  return body.data
}

function fmtDate(val: string | null): string {
  if (!val) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(val))
}

function statusVariant(status: string): string {
  if (status === 'active') return 'success'
  if (status === 'paused') return 'paused'
  if (status === 'disabled') return 'neutral'
  if (status === 'error') return 'danger'
  return 'neutral'
}

export default async function SourcesPage() {
  let sources: SourceRow[] | null = null
  let errorMsg: string | null = null

  try {
    sources = await fetchSources()
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load sources'
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Sources</h1>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        {errorMsg ? (
          <p className={styles.error}>{errorMsg}</p>
        ) : !sources?.length ? (
          <p className={styles.empty}>No sources found.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Cron</th>
                  <th className={styles.num}>Listings</th>
                  <th>Last Scraped</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.id}>
                    <td>
                      <a href={s.baseUrl} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--clr-primary)', textDecoration: 'none', fontWeight: 600 }}>
                        {s.name}
                      </a>
                    </td>
                    <td>
                      <span className={styles.badge} data-variant={statusVariant(s.status)}>
                        {s.status}
                      </span>
                    </td>
                    <td><code style={{ fontSize: '0.8125rem' }}>{s.cronExpression}</code></td>
                    <td className={styles.num}>{s.listingCount.toLocaleString()}</td>
                    <td className={styles.muted}>{fmtDate(s.lastScrapedAt)}</td>
                    <td>
                      {s.errorMessage
                        ? <span className={styles.errorMsg}>{s.errorMessage}</span>
                        : <span className={styles.muted}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
