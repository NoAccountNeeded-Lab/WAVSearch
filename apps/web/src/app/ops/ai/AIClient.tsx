'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'

interface OllamaStatus {
  available: boolean
  baseUrl: string
  models: string[]
}

interface SourceRow {
  id: string
  name: string
  errorMessage: string | null
  lastScrapedAt: string | null
}

interface AiStatus {
  ollama: OllamaStatus
  sourcesNeedingRemap: SourceRow[]
}

interface RunState {
  loading: boolean
  feedback: string | null
  isError: boolean
}

interface AIClientProps {
  apiBaseUrl: string
}

const REFRESH_MS = 30_000

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

export function AIClient({ apiBaseUrl }: AIClientProps) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [runStates, setRunStates] = useState<Record<string, RunState>>({})

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/ai/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: AiStatus }
      setStatus(body.data)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI status')
    } finally {
      setIsRefreshing(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function remapNow(sourceId: string) {
    setRunStates(prev => ({ ...prev, [sourceId]: { loading: true, feedback: null, isError: false } }))
    try {
      const res = await fetch(`${apiBaseUrl}/admin/sources/${encodeURIComponent(sourceId)}/run`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      const body = (await res.json()) as { data: { id: string } }
      setRunStates(prev => ({
        ...prev,
        [sourceId]: { loading: false, feedback: `Job enqueued (${body.data.id})`, isError: false },
      }))
    } catch (err) {
      setRunStates(prev => ({
        ...prev,
        [sourceId]: { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true },
      }))
    }
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>AI</h1>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        <div className={styles.controlsBar}>
          <span className={styles.refreshMeta}>
            {updatedAt ? `Updated ${fmtTime(updatedAt)}` : 'Loading…'}
          </span>
          <div className={styles.controlsBarRight}>
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !status ? (
          <p className={styles.empty}>Loading AI status…</p>
        ) : (
          <>
            <section className={styles.statusCard} aria-label="Ollama status">
              <div className={styles.statusCardHead}>
                <h2 className={styles.activityTitle}>Ollama</h2>
                <span
                  className={styles.badge}
                  data-variant={status.ollama.available ? 'success' : 'danger'}
                >
                  {status.ollama.available ? 'Available' : 'Unavailable'}
                </span>
              </div>
              <div className={styles.statusCardBody}>
                <div className={styles.statusRow}>
                  <span className={styles.statusRowLabel}>Base URL</span>
                  <code style={{ fontSize: '0.8125rem' }}>{status.ollama.baseUrl}</code>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusRowLabel}>Models</span>
                  <div className={styles.modelList}>
                    {status.ollama.models.length === 0 ? (
                      <span className={styles.muted}>None detected</span>
                    ) : (
                      status.ollama.models.map(m => (
                        <code key={m} className={styles.modelChip}>{m}</code>
                      ))
                    )}
                  </div>
                </div>
                {!status.ollama.available && (
                  <p className={styles.errorMsg} style={{ margin: 0 }}>
                    Ollama is not reachable at the configured URL. Structure detection and field remapping will fail until it is restored.
                  </p>
                )}
              </div>
            </section>

            <section style={{ marginTop: '1.75rem' }}>
              <h2 className={styles.sectionHeading}>
                Sources needing remapping
                {status.sourcesNeedingRemap.length > 0 && (
                  <span
                    className={styles.badge}
                    data-variant="danger"
                    style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}
                  >
                    {status.sourcesNeedingRemap.length}
                  </span>
                )}
              </h2>
              {status.sourcesNeedingRemap.length === 0 ? (
                <p className={styles.empty} style={{ padding: '0.75rem 0' }}>
                  All sources are healthy — no remapping needed.
                </p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Last Scraped</th>
                        <th>Error</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.sourcesNeedingRemap.map(s => {
                        const rs = runStates[s.id]
                        return (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600 }}>{s.name}</td>
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
                                  onClick={() => void remapNow(s.id)}
                                  aria-label={`Enqueue scrape-and-remap job for ${s.name}`}
                                >
                                  {rs?.loading ? 'Enqueueing…' : 'Remap Now'}
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
            </section>
          </>
        )}

        <details className={styles.helpPanel}>
          <summary>How AI fits into the scraper</summary>
          <div className={styles.helpBody}>
            <p>WAV Search uses a local <strong>Ollama</strong> instance for two AI-powered features:</p>
            <ol>
              <li>
                <strong>Structure detection</strong> — Before each scrape, the engine fetches a sample page and hashes its DOM. If the hash has changed since the last successful run, the site layout has changed.
              </li>
              <li>
                <strong>Field remapping</strong> — When a layout change is detected, the AI receives the previous CSS selector mappings and the new HTML, then outputs updated selectors. If the confidence score meets the threshold the new mappings are saved and scraping continues automatically. If not, the source is marked <code>needs_remapping</code> for manual review.
              </li>
            </ol>
            <p><strong>Remap Now</strong> enqueues a fresh source-scrape job. The scraper re-checks the structure and attempts AI remapping on that run.</p>
            <p>The model in use is set by the <code>AGENTS_MODEL</code> environment variable on the scraper service (default: <code>llama3.2</code>). Installed models shown above come from the Ollama instance at the API&apos;s configured <code>OLLAMA_BASE_URL</code>.</p>
          </div>
        </details>
      </div>
    </main>
  )
}
