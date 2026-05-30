'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'

interface RunRow {
  id: string
  sourceId: string
  sourceName: string | null
  startedAt: string
  finishedAt: string | null
  success: boolean | null
  listingsFound: number | null
  listingsNew: number | null
  listingsUpdated: number | null
  errorMessage: string | null
}

type Filter = 'all' | 'success' | 'failed' | 'running'

interface RunsClientProps {
  apiBaseUrl: string
}

const REFRESH_MS = 15_000

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
  if (!end) return 'running…'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m`
}

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function RunsClient({ apiBaseUrl }: RunsClientProps) {
  const [runs, setRuns] = useState<RunRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/runs`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: RunRow[] }
      setRuns(body.data)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs')
    } finally {
      setIsRefreshing(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  const filtered = useMemo(() => {
    if (!runs) return null
    if (filter === 'all') return runs
    if (filter === 'success') return runs.filter(r => r.success === true)
    if (filter === 'failed') return runs.filter(r => r.success === false)
    if (filter === 'running') return runs.filter(r => r.success === null)
    return runs
  }, [runs, filter])

  const counts = useMemo(() => {
    if (!runs) return { success: 0, failed: 0, running: 0 }
    return {
      success: runs.filter(r => r.success === true).length,
      failed: runs.filter(r => r.success === false).length,
      running: runs.filter(r => r.success === null).length,
    }
  }, [runs])

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Scraper Runs</h1>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        <div className={styles.controlsBar}>
          <div className={styles.filterGroup} role="group" aria-label="Filter runs">
            {(['all', 'running', 'success', 'failed'] as Filter[]).map(f => (
              <button
                key={f}
                className={styles.filterPill}
                type="button"
                data-active={filter === f ? 'true' : 'false'}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? `All (${runs?.length ?? 0})` : null}
                {f === 'running' ? `Running (${counts.running})` : null}
                {f === 'success' ? `Success (${counts.success})` : null}
                {f === 'failed' ? `Failed (${counts.failed})` : null}
              </button>
            ))}
          </div>
          <div className={styles.controlsBarRight}>
            <span className={styles.refreshMeta}>
              {updatedAt ? `Updated ${fmtTime(updatedAt)}` : 'Loading…'}
            </span>
            <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => void refresh()} disabled={isRefreshing}>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !filtered ? (
          <p className={styles.empty}>Loading runs…</p>
        ) : !filtered.length ? (
          <p className={styles.empty}>No {filter !== 'all' ? filter : ''} runs found.</p>
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
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className={styles.muted}>{fmtDate(r.startedAt)}</td>
                    <td>
                      {r.sourceName
                        ? <span style={{ fontWeight: 600 }}>{r.sourceName}</span>
                        : <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--clr-text-muted)' }}>{r.sourceId.slice(0, 8)}…</span>}
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

        <details className={styles.helpPanel}>
          <summary>What scraper runs represent</summary>
          <div className={styles.helpBody}>
            <p>A <strong>scraper run</strong> is a single execution of the source-scrape job for one data source. Each run record tracks:</p>
            <ul>
              <li><strong>Found</strong> — total listings returned by the source during this run</li>
              <li><strong>New</strong> — listings that didn't exist in the database before this run</li>
              <li><strong>Updated</strong> — listings that already existed but had changed fields</li>
            </ul>
            <p>A run marked <strong>In progress</strong> is currently executing (or crashed before it could write a result — check the scraper service logs if a run stays in this state for more than 30 minutes).</p>
            <p>Runs only cover the index-page scrape step. Detail crawling, geocoding, and deduplication are tracked separately as BullMQ jobs — see the <Link href="/ops/queues" style={{ color: 'var(--clr-primary)' }}>Queues page</Link> for those.</p>
          </div>
        </details>
      </div>
    </main>
  )
}
