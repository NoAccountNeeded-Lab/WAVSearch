'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'

interface OllamaStatus {
  available: boolean
  baseUrl: string
  models: string[]
  runningModels: Array<{
    name: string
    sizeBytes: number | null
    vramBytes: number | null
    processor: string | null
    contextWindow: number | null
    expiresAt: string | null
  }>
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

interface ConfigEntry {
  id: string
  key: string
  value: string | number | boolean | Record<string, unknown> | null
  type: 'string' | 'number' | 'boolean' | 'json' | 'secret'
  description: string | null
  hint: string | null
  createdAt: string
  createdBy: string | null
}

// AI job definitions — model is configurable per job; provider is always Ollama
const AI_JOBS = [
  { id: 'intake',            label: 'Intake (search assistant)', modelKey: 'ai.intake.model' },
  { id: 'scraper.structure', label: 'Scraper — structure detect', modelKey: 'ai.scraper.structure.model' },
  { id: 'scraper.remap',     label: 'Scraper — field remap',     modelKey: 'ai.scraper.remap.model' },
  { id: 'agents',            label: 'Agent pipeline',            modelKey: 'ai.agents.model' },
] as const

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

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

function fmtUntil(val: string | null): string {
  if (!val) return '—'
  const date = new Date(val)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return 'unloading'
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'under 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  return `${hours} hr`
}

export function AIClient({ apiBaseUrl }: AIClientProps) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [runStates, setRunStates] = useState<Record<string, RunState>>({})

  // Config state
  const [configEntries, setConfigEntries] = useState<ConfigEntry[]>([])
  const [configSaving, setConfigSaving] = useState<Record<string, boolean>>({})
  const [configFeedback, setConfigFeedback] = useState<Record<string, { msg: string; isError: boolean }>>({})

  function getConfigValue(key: string): string {
    const entry = configEntries.find(e => e.key === key)
    if (!entry || entry.value === null) return ''
    return String(entry.value)
  }

  const refreshConfig = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/admin/config`, { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { data: ConfigEntry[] }
      setConfigEntries(body.data.filter(e => e.type !== 'secret'))
    } catch {
      // config fetch is best-effort — don't break the page
    }
  }, [apiBaseUrl])

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

  async function saveConfigValue(key: string, value: string) {
    setConfigSaving(prev => ({ ...prev, [key]: true }))
    setConfigFeedback(prev => ({ ...prev, [key]: { msg: '', isError: false } }))
    try {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type: 'string' }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setConfigFeedback(prev => ({ ...prev, [key]: { msg: 'Saved', isError: false } }))
      await refreshConfig()
    } catch (err) {
      setConfigFeedback(prev => ({
        ...prev,
        [key]: { msg: err instanceof Error ? err.message : 'Error', isError: true },
      }))
    } finally {
      setConfigSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  useEffect(() => {
    void refresh()
    void refreshConfig()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh, refreshConfig])

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

  const loadedCount = status?.ollama.runningModels.length ?? 0
  const totalModelMemory = status?.ollama.runningModels.reduce((sum, model) => sum + (model.sizeBytes ?? 0), 0) ?? 0
  const totalVramMemory = status?.ollama.runningModels.reduce((sum, model) => sum + (model.vramBytes ?? 0), 0) ?? 0

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
                <div className={styles.metricGrid} aria-label="Ollama runtime summary">
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Loaded models</span>
                    <span className={styles.metricValue}>{loadedCount}</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>Model memory</span>
                    <span className={styles.metricValue}>{fmtBytes(totalModelMemory)}</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricLabel}>VRAM / unified memory</span>
                    <span className={styles.metricValue}>{fmtBytes(totalVramMemory)}</span>
                  </div>
                </div>
                <div>
                  <h3 className={styles.subsectionHeading}>Loaded right now</h3>
                  {status.ollama.runningModels.length === 0 ? (
                    <p className={styles.emptyCompact}>No models are currently loaded in Ollama memory.</p>
                  ) : (
                    <div className={styles.tableWrapper}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th className={styles.num}>Size</th>
                            <th className={styles.num}>VRAM</th>
                            <th>Processor</th>
                            <th className={styles.num}>Context</th>
                            <th>Until</th>
                          </tr>
                        </thead>
                        <tbody>
                          {status.ollama.runningModels.map(model => (
                            <tr key={model.name}>
                              <td><code className={styles.inlineCode}>{model.name}</code></td>
                              <td className={styles.num}>{fmtBytes(model.sizeBytes)}</td>
                              <td className={styles.num}>{fmtBytes(model.vramBytes)}</td>
                              <td>{model.processor ?? <span className={styles.muted}>—</span>}</td>
                              <td className={styles.num}>{model.contextWindow?.toLocaleString() ?? '—'}</td>
                              <td>{fmtUntil(model.expiresAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {!status.ollama.available && (
                  <p className={styles.errorMsg} style={{ margin: 0 }}>
                    Ollama is not reachable at the configured URL. All AI features (intake, structure detection, field remapping) will fall back to empty results until it is restored.
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

            {/* ── Model Configuration ─────────────────────────── */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="model-config-heading">
              <h2 id="model-config-heading" className={styles.sectionHeading}>Model Configuration</h2>
              <p className={styles.sectionIntro}>
                All AI jobs use Ollama. Override the default model per job — leave blank to use the Ollama default.
              </p>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>AI Job</th>
                      <th>Model</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AI_JOBS.map(job => {
                      const currentModel = getConfigValue(job.modelKey)
                      const feedback = configFeedback[job.modelKey]
                      const saving = configSaving[job.modelKey]

                      return (
                        <tr key={job.id}>
                          <td style={{ fontWeight: 600 }}>{job.label}</td>
                          <td>
                            <input
                              aria-label={`Model for ${job.label}`}
                              aria-describedby={`model-save-hint-${job.id}`}
                              type="text"
                              className={styles.input}
                              defaultValue={currentModel}
                              key={currentModel}
                              disabled={saving}
                              onBlur={e => {
                                if (e.target.value !== currentModel) {
                                  void saveConfigValue(job.modelKey, e.target.value)
                                }
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                              }}
                              placeholder="e.g. llama3.2"
                              style={{ width: '18rem' }}
                            />
                            <span
                              id={`model-save-hint-${job.id}`}
                              style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0, padding: 0, margin: '-1px' }}
                            >
                              Press Enter or tab away to save
                            </span>
                          </td>
                          <td>
                            <span role="status" aria-live="polite" aria-atomic="true">
                              {saving ? (
                                <span className={styles.muted}>Saving…</span>
                              ) : feedback?.msg ? (
                                <span className={feedback.isError ? styles.errorMsg : styles.muted} style={{ fontSize: '0.75rem' }}>
                                  {feedback.msg}
                                </span>
                              ) : currentModel ? (
                                <span className={styles.badge} data-variant="success">{currentModel}</span>
                              ) : (
                                <span className={styles.muted}>default</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <details className={styles.helpPanel}>
          <summary>How AI fits into WAV Search</summary>
          <div className={styles.helpBody}>
            <p>WAV Search uses a local <strong>Ollama</strong> instance for all AI features:</p>
            <ol>
              <li>
                <strong>Intake</strong> — The home page search assistant interprets plain-language descriptions
                into structured filters (conversion type, ramp, price, state, etc.). Test it at{' '}
                <a href="/ops/intake">Ops → Intake Test</a>.
              </li>
              <li>
                <strong>Structure detection</strong> — Before each scrape, the engine fetches a sample page
                and hashes its DOM. If the hash has changed, the site layout has changed.
              </li>
              <li>
                <strong>Field remapping</strong> — When a layout change is detected, the AI receives the
                previous CSS selector mappings and the new HTML, then outputs updated selectors. If the
                confidence score meets the threshold the new mappings are saved automatically. If not, the
                source is marked <code>needs_remapping</code> for manual review.
              </li>
            </ol>
            <p>
              <strong>Remap Now</strong> enqueues a fresh source-scrape job. The scraper re-checks the
              structure and attempts AI remapping on that run.
            </p>
            <p>
              The model for each job defaults to <code>llama3.2</code> and can be overridden in
              <strong> Model Configuration</strong> above. Ollama must be running and the model must be
              pulled (<code>ollama pull llama3.2</code>) before any AI features work. The base URL is set
              via <code>OLLAMA_BASE_URL</code> in the environment.
            </p>
          </div>
        </details>
      </div>
    </main>
  )
}
