'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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

interface RunState {
  loading: boolean
  feedback: string | null
  isError: boolean
}

interface SourcesClientProps {
  apiBaseUrl: string
}

const REFRESH_MS = 30_000

function statusVariant(status: string): string {
  if (status === 'active') return 'success'
  if (status === 'paused') return 'paused'
  if (status === 'disabled') return 'neutral'
  if (status === 'error' || status === 'needs_remapping') return 'danger'
  return 'neutral'
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

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function SourcesClient({ apiBaseUrl }: SourcesClientProps) {
  const [sources, setSources] = useState<SourceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [runStates, setRunStates] = useState<Record<string, RunState>>({})

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/sources`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: SourceRow[] }
      setSources(body.data)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources')
    } finally {
      setIsRefreshing(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function runNow(sourceId: string) {
    setRunStates(prev => ({ ...prev, [sourceId]: { loading: true, feedback: null, isError: false } }))
    try {
      const res = await fetch(`${apiBaseUrl}/admin/sources/${encodeURIComponent(sourceId)}/run`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const body = (await res.json()) as { data: { id: string } }
      setRunStates(prev => ({ ...prev, [sourceId]: { loading: false, feedback: `Job enqueued (${body.data.id})`, isError: false } }))
    } catch (err) {
      setRunStates(prev => ({ ...prev, [sourceId]: { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true } }))
    }
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Sources</h1>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        <div className={styles.controlsBar}>
          <span className={styles.refreshMeta}>
            {updatedAt ? `Updated ${fmtTime(updatedAt)}` : 'Loading…'}
          </span>
          <div className={styles.controlsBarRight}>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => void refresh()} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !sources ? (
          <p className={styles.empty}>Loading sources…</p>
        ) : !sources.length ? (
          <p className={styles.empty}>No sources found.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>
                    Status
                    <span
                      className={styles.tip}
                      data-tip="active = scraping normally · error = last run failed · needs_remapping = HTML structure changed and AI remapping is needed · paused = manually paused"
                      tabIndex={0}
                      aria-label="Status field explanation"
                    >?</span>
                  </th>
                  <th>
                    Cron
                    <span
                      className={styles.tip}
                      data-tip="Standard 5-field cron expression (minute hour day month weekday). Example: '0 */6 * * *' = every 6 hours. Drives the automatic scrape schedule."
                      tabIndex={0}
                      aria-label="Cron expression explanation"
                    >?</span>
                  </th>
                  <th className={styles.num}>Listings</th>
                  <th>Last Scraped</th>
                  <th>Error</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => {
                  const rs = runStates[s.id]
                  return (
                    <tr key={s.id}>
                      <td>
                        <a
                          href={s.baseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--clr-primary)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {s.name} ↗
                        </a>
                      </td>
                      <td>
                        <span className={styles.badge} data-variant={statusVariant(s.status)}>
                          {s.status}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.8125rem' }}>{s.cronExpression}</code>
                      </td>
                      <td className={styles.num}>{s.listingCount.toLocaleString()}</td>
                      <td className={styles.muted}>{fmtDate(s.lastScrapedAt)}</td>
                      <td>
                        {s.errorMessage
                          ? <span className={styles.errorMsg}>{s.errorMessage}</span>
                          : <span className={styles.muted}>—</span>}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            type="button"
                            disabled={rs?.loading}
                            onClick={() => void runNow(s.id)}
                            aria-label={`Run ${s.name} scrape now`}
                          >
                            {rs?.loading ? 'Enqueueing…' : 'Run Now'}
                          </button>
                          {rs?.feedback && (
                            <span
                              className={rs.isError ? styles.errorMsg : styles.muted}
                              style={{ fontSize: '0.75rem' }}
                            >
                              {rs.feedback}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <details className={styles.helpPanel}>
          <summary>How source scraping works</summary>
          <div className={styles.helpBody}>
            <p>Each source is a website that lists wheelchair accessible vehicles (WAVs). The scraper pipeline has several stages:</p>
            <ol>
              <li><strong>source-scrape</strong> — Fetches the listing index page(s) from a source and upserts listings into the database. Before scraping, it checks whether the site's HTML structure has changed — if it has, Claude AI remaps the CSS selectors automatically.</li>
              <li><strong>detail-crawl</strong> — Uses Playwright to open each listing's detail URL and store the full HTML. This is needed because many WAV-specific fields (ramp type, lift, controls) only appear on the detail page.</li>
              <li><strong>detail-extract</strong> — Parses the stored detail HTML without any network calls to extract WAV fields.</li>
              <li><strong>geocode</strong> — Converts city + state to GPS coordinates so listings can be shown on a map.</li>
              <li><strong>deduplicate</strong> — Detects the same vehicle sold across multiple sources (matched by VIN) and marks the most complete listing as canonical.</li>
            </ol>
            <p><strong>Run Now</strong> immediately enqueues a source-scrape job, bypassing the cron schedule. Useful after fixing an error or adding a new source.</p>
            <p>Status <strong>needs_remapping</strong> means the site's HTML changed and AI auto-remapping didn't meet the confidence threshold. Check the scraper logs and re-run once the selector mapping is corrected.</p>
          </div>
        </details>
      </div>
    </main>
  )
}
