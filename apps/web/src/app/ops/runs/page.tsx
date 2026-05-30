import Link from 'next/link'
import { getServerApiBaseUrl } from '@/lib/api-url'
import styles from '../ops.module.css'

interface RunRow {
  id: string
  sourceId: string
  startedAt: string
  finishedAt: string | null
  success: boolean | null
  listingsFound: number | null
  listingsNew: number | null
  listingsUpdated: number | null
  errorMessage: string | null
}

async function fetchRuns(): Promise<RunRow[]> {
  const res = await fetch(`${getServerApiBaseUrl()}/admin/runs`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  const body = (await res.json()) as { data: RunRow[] }
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

function duration(start: string, end: string | null): string {
  if (!end) return 'running'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

export default async function RunsPage() {
  let runs: RunRow[] | null = null
  let errorMsg: string | null = null

  try {
    runs = await fetchRuns()
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load runs'
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Scraper Runs</h1>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        {errorMsg ? (
          <p className={styles.error}>{errorMsg}</p>
        ) : !runs?.length ? (
          <p className={styles.empty}>No scraper runs recorded yet.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Source</th>
                  <th>Result</th>
                  <th>Duration</th>
                  <th className={styles.num}>Found</th>
                  <th className={styles.num}>New</th>
                  <th className={styles.num}>Updated</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id}>
                    <td className={styles.muted}>{fmtDate(r.startedAt)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                      {r.sourceId.slice(0, 8)}…
                    </td>
                    <td>
                      {r.success == null
                        ? <span className={styles.badge} data-variant="neutral">In progress</span>
                        : r.success
                          ? <span className={styles.badge} data-variant="success">Success</span>
                          : <span className={styles.badge} data-variant="danger">Failed</span>}
                    </td>
                    <td className={styles.muted}>{duration(r.startedAt, r.finishedAt)}</td>
                    <td className={styles.num}>{r.listingsFound ?? '—'}</td>
                    <td className={styles.num}>{r.listingsNew ?? '—'}</td>
                    <td className={styles.num}>{r.listingsUpdated ?? '—'}</td>
                    <td>
                      {r.errorMessage
                        ? <span className={styles.errorMsg}>{r.errorMessage}</span>
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
