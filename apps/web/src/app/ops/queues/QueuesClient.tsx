'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'

interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

interface QueueRow {
  name: string
  paused: boolean
  stats: QueueStats
}

interface JobRecord {
  id: string
  name: string
  data: unknown
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  createdAt: string
  finishedAt?: string
  failedReason?: string
  attemptsMade: number
  progress: unknown
  logs: string[]
}

interface QueueDetail extends QueueRow {
  jobs: JobRecord[]
}

interface QueueMeta {
  short: string
  detail: string
  canTrigger: boolean
}

const QUEUE_META: Record<string, QueueMeta> = {
  'source-scrape': {
    short: 'Fetches listing pages from a data source (BLVD.com, MobilityWorks)',
    detail: 'Triggered per-source on a cron schedule or manually. Use the Sources page to trigger a specific source immediately.',
    canTrigger: false,
  },
  'detail-crawl': {
    short: 'Loads full listing detail pages via Playwright and stores the raw HTML',
    detail: 'Finds listings that haven\'t had their detail page fetched yet. Rate-limited to one page every 2 seconds to be polite to source sites. Runs hourly.',
    canTrigger: true,
  },
  'detail-extract': {
    short: 'Parses stored HTML to extract WAV-specific fields (ramp, lift, wheelchair capacity)',
    detail: 'Reads from the raw_pages table — no network calls. Processes up to 100 pages per job run. Runs every 5 minutes.',
    canTrigger: true,
  },
  'geocode': {
    short: 'Converts city + state to GPS coordinates using OpenStreetMap Nominatim',
    detail: 'Finds listings with a null lat/lng. Rate-limited to 1 request per 1.1 seconds per Nominatim\'s usage policy. Runs nightly at 2 AM.',
    canTrigger: true,
  },
  'deduplicate': {
    short: 'Finds vehicles appearing across multiple sources and marks the best one as canonical',
    detail: 'Matches by VIN. Picks the canonical listing by completeness score (non-null optional fields + image count). Others get isDuplicate=true. Runs nightly at 3 AM.',
    canTrigger: true,
  },
}

interface ActionState {
  loading: boolean
  feedback: string | null
  isError: boolean
}

interface QueuesClientProps {
  apiBaseUrl: string
}

const REFRESH_MS = 15_000

export function QueuesClient({ apiBaseUrl }: QueuesClientProps) {
  const [queues, setQueues] = useState<QueueRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null)
  const [queueDetail, setQueueDetail] = useState<QueueDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<ActionState>({ loading: false, feedback: null, isError: false })

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/queues`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: QueueRow[] }
      setQueues(body.data)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queues')
    } finally {
      setIsRefreshing(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  const refreshQueueDetail = useCallback(async (name: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/admin/queues/${encodeURIComponent(name)}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: QueueDetail }
      setQueueDetail(body.data)
      setDetailError(null)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load queue activity')
    }
  }, [apiBaseUrl])

  useEffect(() => {
    if (!selectedQueue) return
    void refreshQueueDetail(selectedQueue)
    const interval = window.setInterval(() => void refreshQueueDetail(selectedQueue), 3000)
    return () => window.clearInterval(interval)
  }, [refreshQueueDetail, selectedQueue])

  function setAction(name: string, state: ActionState) {
    setActionStates(prev => ({ ...prev, [name]: state }))
  }

  async function pauseQueue(name: string) {
    setAction(name, { loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/queues/${encodeURIComponent(name)}/pause`, { method: 'POST' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setQueues(prev => prev?.map(q => q.name === name ? { ...q, paused: true } : q) ?? null)
      setAction(name, { loading: false, feedback: 'Paused', isError: false })
    } catch (err) {
      setAction(name, { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  async function resumeQueue(name: string) {
    setAction(name, { loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/queues/${encodeURIComponent(name)}/resume`, { method: 'POST' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setQueues(prev => prev?.map(q => q.name === name ? { ...q, paused: false } : q) ?? null)
      setAction(name, { loading: false, feedback: 'Resumed', isError: false })
    } catch (err) {
      setAction(name, { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  async function triggerSync() {
    setSyncState({ loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/sync`, { method: 'POST' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const body = (await res.json()) as { data: { synced: number } }
      setSyncState({ loading: false, feedback: `Synced ${body.data.synced.toLocaleString()} listings`, isError: false })
    } catch (err) {
      setSyncState({ loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  async function triggerQueue(name: string) {
    setAction(name, { loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/queues/${encodeURIComponent(name)}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const body = (await res.json()) as { data: { id: string } }
      setAction(name, { loading: false, feedback: `Enqueued job ${body.data.id}`, isError: false })
      setTimeout(() => void refresh(), 1000)
    } catch (err) {
      setAction(name, { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Queues</h1>
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
            <a href={`${apiBaseUrl}/admin/board`} target="_blank" rel="noopener noreferrer" className={`${styles.btn} ${styles.btnGhost}`}>
              Bull Board ↗
            </a>
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              type="button"
              onClick={() => void triggerSync()}
              disabled={syncState.loading}
            >
              {syncState.loading ? 'Syncing…' : 'Sync Meilisearch'}
            </button>
          </div>
        </div>
        {syncState.feedback && (
          <p className={syncState.isError ? styles.errorMsg : styles.muted} style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
            {syncState.feedback}
          </p>
        )}

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !queues ? (
          <p className={styles.empty}>Loading queues…</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Status</th>
                  <th className={styles.num}>Waiting</th>
                  <th className={styles.num}>Active</th>
                  <th className={styles.num}>Delayed</th>
                  <th className={styles.num}>Completed</th>
                  <th className={styles.num}>Failed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queues.map(q => {
                  const meta = QUEUE_META[q.name]
                  const act = actionStates[q.name]
                  const isImpl = !!meta
                  const isExpanded = selectedQueue === q.name
                  return (
                    <Fragment key={q.name}>
                      <tr className={isImpl ? undefined : styles.dimRow}>
                        <td>
                          <div className={styles.queueNameWrap}>
                            <div className={styles.queueName}>
                              <code style={{ fontSize: '0.8125rem' }}>{q.name}</code>
                              {meta && (
                                <span
                                  className={styles.tip}
                                  data-tip={`${meta.short}\n\n${meta.detail}`}
                                  tabIndex={0}
                                  aria-label={`Info: ${meta.short}`}
                                >?</span>
                              )}
                            </div>
                            {meta && <div className={styles.queueDesc}>{meta.short}</div>}
                            {!meta && <div className={styles.queueDesc}>Not yet implemented</div>}
                          </div>
                        </td>
                        <td>
                          <span
                            className={styles.badge}
                            data-variant={q.paused ? 'paused' : q.stats.active > 0 ? 'success' : 'neutral'}
                          >
                            {q.paused ? 'Paused' : q.stats.active > 0 ? 'Active' : 'Idle'}
                          </span>
                        </td>
                        <td className={styles.num}>{q.stats.waiting}</td>
                        <td className={styles.num}>{q.stats.active}</td>
                        <td className={styles.num}>{q.stats.delayed}</td>
                        <td className={styles.num}>{q.stats.completed}</td>
                        <td className={styles.num}>
                          {q.stats.failed > 0
                            ? <span style={{ color: 'var(--clr-danger-text)', fontWeight: 600 }}>{q.stats.failed}</span>
                            : 0}
                        </td>
                        <td>
                          {isImpl && (
                            <div className={styles.actions}>
                              {q.paused ? (
                                <button
                                  className={`${styles.btn} ${styles.btnPrimary}`}
                                  type="button"
                                  disabled={act?.loading}
                                  onClick={() => void resumeQueue(q.name)}
                                >
                                  Resume
                                </button>
                              ) : (
                                <button
                                  className={`${styles.btn} ${styles.btnGhost}`}
                                  type="button"
                                  disabled={act?.loading}
                                  onClick={() => void pauseQueue(q.name)}
                                >
                                  Pause
                                </button>
                              )}
                              {meta.canTrigger && (
                                <button
                                  className={`${styles.btn} ${styles.btnGhost}`}
                                  type="button"
                                  disabled={act?.loading}
                                  onClick={() => void triggerQueue(q.name)}
                                >
                                  Trigger
                                </button>
                              )}
                              <button
                                className={`${styles.btn} ${isExpanded ? styles.btnPrimary : styles.btnGhost}`}
                                type="button"
                                onClick={() => setSelectedQueue(prev => prev === q.name ? null : q.name)}
                              >
                                Activity
                              </button>
                              {act?.feedback && (
                                <span className={act.isError ? styles.errorMsg : styles.muted} style={{ fontSize: '0.75rem' }}>
                                  {act.feedback}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={styles.expandedRow}>
                          <td colSpan={8}>
                            <div className={styles.activityHeader}>
                              <div>
                                <h2 className={styles.activityTitle}>{q.name} activity</h2>
                                <p className={styles.activityMeta}>Auto-refreshes every 3 s</p>
                              </div>
                              <button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={() => void refreshQueueDetail(q.name)}>
                                Refresh
                              </button>
                            </div>
                            {detailError ? (
                              <p className={`${styles.error}`} style={{ margin: '1rem' }}>{detailError}</p>
                            ) : !queueDetail || queueDetail.name !== q.name ? (
                              <p className={styles.empty} style={{ padding: '1rem' }}>Loading activity…</p>
                            ) : queueDetail.jobs.length === 0 ? (
                              <p className={styles.empty} style={{ padding: '1rem' }}>No recent jobs.</p>
                            ) : (
                              <div className={styles.jobList}>
                                {queueDetail.jobs.map(job => (
                                  <article key={job.id} className={styles.jobItem}>
                                    <div className={styles.jobTopline}>
                                      <code className={styles.jobId}>#{job.id}</code>
                                      <span className={styles.badge} data-variant={job.status === 'failed' ? 'danger' : job.status === 'active' ? 'success' : 'neutral'}>
                                        {job.status}
                                      </span>
                                      <span className={styles.muted}>attempts {job.attemptsMade}</span>
                                      <span className={styles.muted}>{fmtDateTime(job.createdAt)}</span>
                                    </div>
                                    <div className={styles.jobGrid}>
                                      <div>
                                        <h3 className={styles.jobSubhead}>Progress</h3>
                                        <pre className={styles.miniCode}>{formatUnknown(job.progress)}</pre>
                                      </div>
                                      <div>
                                        <h3 className={styles.jobSubhead}>Payload</h3>
                                        <pre className={styles.miniCode}>{formatUnknown(job.data)}</pre>
                                      </div>
                                    </div>
                                    {job.failedReason && <p className={styles.errorMsg}>{job.failedReason}</p>}
                                    <div>
                                      <h3 className={styles.jobSubhead}>Logs</h3>
                                      {job.logs.length === 0 ? (
                                        <p className={styles.muted}>No logs yet.</p>
                                      ) : (
                                        <ol className={styles.logList}>
                                          {job.logs.map((line, i) => <li key={`${job.id}-${i}`}>{line}</li>)}
                                        </ol>
                                      )}
                                    </div>
                                  </article>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <details className={styles.helpPanel}>
          <summary>How BullMQ queues work</summary>
          <div className={styles.helpBody}>
            <p>WAV Search uses <strong>BullMQ</strong> (backed by Valkey/Redis) to run background jobs in isolation from the API and web app.</p>
            <ol>
              <li><strong>source-scrape</strong> — Fetches listing pages from each source. Triggered by cron or "Run Now" on the Sources page. Produces listings in the database.</li>
              <li><strong>detail-crawl</strong> — Uses Playwright to open individual listing URLs and store raw HTML. Triggered hourly by cron.</li>
              <li><strong>detail-extract</strong> — Parses the stored HTML to pull out WAV-specific fields (ramp type, lift, controls, etc.). Runs every 5 minutes.</li>
              <li><strong>geocode</strong> — Resolves city + state to GPS coordinates using Nominatim (OpenStreetMap). Deduplicates by unique location — each city/state is looked up once regardless of how many listings share it. Runs nightly at 2 AM.</li>
              <li><strong>deduplicate</strong> — Finds the same vehicle listed at multiple sources (matched by VIN) and marks one as canonical. Runs nightly at 3 AM.</li>
            </ol>
            <p><strong>After geocoding completes, click "Sync Meilisearch"</strong> (top right) to push the new coordinates into the search index — that&apos;s what makes pins appear on the map. Geocode updates Postgres; sync copies it to Meilisearch.</p>
            <p><strong>Pausing</strong> a queue stops workers from picking up new jobs — jobs already in progress finish. <strong>Triggering</strong> enqueues a job immediately without waiting for the cron schedule.</p>
            <p>For a full visual view of queue internals (job payloads, retry counts, stack traces), open <a href={`${apiBaseUrl}/admin/board`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--clr-primary)' }}>Bull Board ↗</a>.</p>
          </div>
        </details>
      </div>
    </main>
  )
}

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatUnknown(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'none'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}
