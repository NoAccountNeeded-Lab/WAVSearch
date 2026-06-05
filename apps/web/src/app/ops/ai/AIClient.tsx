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

// AI job definitions with their config keys and display labels
const AI_JOBS = [
  { id: 'intake',            label: 'Intake (search assistant)', providerKey: 'ai.intake.provider',                modelKey: 'ai.intake.model' },
  { id: 'scraper.structure', label: 'Scraper — structure detect', providerKey: 'ai.scraper.structure.provider',     modelKey: 'ai.scraper.structure.model' },
  { id: 'scraper.remap',     label: 'Scraper — field remap',     providerKey: 'ai.scraper.remap.provider',          modelKey: 'ai.scraper.remap.model' },
  { id: 'agents',            label: 'Agent pipeline',            providerKey: 'ai.agents.provider',                modelKey: 'ai.agents.model' },
] as const

const PROVIDERS = ['anthropic', 'ollama'] as const
type Provider = (typeof PROVIDERS)[number]

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

  // Secret panel state
  const [secrets, setSecrets] = useState<ConfigEntry[]>([])
  const [newSecretKey, setNewSecretKey] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [newSecretDesc, setNewSecretDesc] = useState('')
  const [secretSaving, setSecretSaving] = useState(false)
  const [secretFeedback, setSecretFeedback] = useState<{ msg: string; isError: boolean } | null>(null)
  const [deletedSecretMsg, setDeletedSecretMsg] = useState('')

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
      const all = body.data
      setConfigEntries(all.filter(e => e.type !== 'secret'))
      setSecrets(all.filter(e => e.type === 'secret'))
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

  async function saveConfigValue(key: string, value: string, type: 'string' = 'string') {
    setConfigSaving(prev => ({ ...prev, [key]: true }))
    setConfigFeedback(prev => ({ ...prev, [key]: { msg: '', isError: false } }))
    try {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, type }),
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

  async function saveSecret() {
    if (!newSecretKey.trim() || !newSecretValue.trim()) {
      setSecretFeedback({ msg: 'Key and value are required', isError: true })
      return
    }
    setSecretSaving(true)
    setSecretFeedback(null)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(newSecretKey.trim())}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newSecretValue, type: 'secret', description: newSecretDesc || undefined }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setSecretFeedback({ msg: 'Secret stored', isError: false })
      setNewSecretKey('')
      setNewSecretValue('')
      setNewSecretDesc('')
      await refreshConfig()
    } catch (err) {
      setSecretFeedback({ msg: err instanceof Error ? err.message : 'Error', isError: true })
    } finally {
      setSecretSaving(false)
    }
  }

  async function deleteSecret(key: string) {
    try {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setDeletedSecretMsg(`Secret "${key}" deleted`)
      await refreshConfig()
    } catch (err) {
      setSecretFeedback({ msg: err instanceof Error ? err.message : 'Delete failed', isError: true })
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

            {/* ── Provider Configuration ─────────────────────── */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="provider-config-heading">
              <h2 id="provider-config-heading" className={styles.sectionHeading}>Provider Configuration</h2>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>AI Job</th>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AI_JOBS.map(job => {
                      const currentProvider = getConfigValue(job.providerKey) as Provider | ''
                      const currentModel = getConfigValue(job.modelKey)
                      const providerFeedback = configFeedback[job.providerKey]
                      const modelFeedback = configFeedback[job.modelKey]
                      const anyFeedback = providerFeedback?.msg || modelFeedback?.msg
                      const anyError = providerFeedback?.isError || modelFeedback?.isError
                      const saving = configSaving[job.providerKey] || configSaving[job.modelKey]

                      return (
                        <tr key={job.id}>
                          <td style={{ fontWeight: 600 }}>{job.label}</td>
                          <td>
                            <select
                              aria-label={`Provider for ${job.label}`}
                              value={currentProvider}
                              disabled={saving}
                              onChange={e => {
                                void saveConfigValue(job.providerKey, e.target.value)
                              }}
                              style={{
                                padding: '0.25rem 0.5rem',
                                border: '1px solid var(--clr-border-strong)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--clr-bg)',
                                color: 'var(--clr-text)',
                                fontSize: '0.875rem',
                              }}
                            >
                              <option value="">— not set —</option>
                              {PROVIDERS.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </td>
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
                              placeholder="e.g. claude-haiku-4-5-20251001"
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
                              ) : anyFeedback ? (
                                <span className={anyError ? styles.errorMsg : styles.muted} style={{ fontSize: '0.75rem' }}>
                                  {anyFeedback}
                                </span>
                              ) : currentProvider ? (
                                <span className={styles.badge} data-variant="success">{currentProvider}</span>
                              ) : (
                                <span className={styles.muted}>—</span>
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

            {/* ── Secrets panel ─────────────────────────────── */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="secrets-panel-heading">
              <h2 id="secrets-panel-heading" className={styles.sectionHeading}>API Keys (Secrets)</h2>
              <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0, padding: 0, margin: '-1px' }}>
                {deletedSecretMsg}
              </div>

              {secrets.length === 0 ? (
                <p className={styles.empty} style={{ padding: '0.75rem 0' }}>
                  No API keys stored yet.
                </p>
              ) : (
                <div className={styles.tableWrapper} style={{ marginBottom: '1rem' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Description</th>
                        <th>Hint (last 4)</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secrets.map(s => (
                        <tr key={s.id}>
                          <td><code style={{ fontSize: '0.8125rem' }}>{s.key}</code></td>
                          <td className={styles.muted}>{s.description ?? '—'}</td>
                          <td><code style={{ fontSize: '0.8125rem' }}>…{s.hint ?? '????'}</code></td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.btnDanger}`}
                              onClick={() => { void deleteSecret(s.key) }}
                              aria-label={`Delete secret ${s.key}`}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add new secret form */}
              <div style={{ border: '1px solid var(--clr-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                <h3 className={styles.subsectionHeading}>Add API key</h3>
                <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '32rem' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Config key
                    </span>
                    <input
                      type="text"
                      className={styles.input}
                      value={newSecretKey}
                      onChange={e => setNewSecretKey(e.target.value)}
                      placeholder="e.g. secret.anthropic.default"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      API key value (write-only)
                    </span>
                    <input
                      type="password"
                      className={styles.input}
                      value={newSecretValue}
                      onChange={e => setNewSecretValue(e.target.value)}
                      placeholder="sk-ant-api-…"
                      autoComplete="new-password"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Description (optional)
                    </span>
                    <input
                      type="text"
                      className={styles.input}
                      value={newSecretDesc}
                      onChange={e => setNewSecretDesc(e.target.value)}
                      placeholder="Anthropic prod key"
                    />
                  </label>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => { void saveSecret() }}
                      disabled={secretSaving}
                      aria-label="Store new API key"
                    >
                      {secretSaving ? 'Storing…' : 'Store key'}
                    </button>
                    <span
                      role={secretFeedback?.isError ? 'alert' : 'status'}
                      aria-live={secretFeedback?.isError ? 'assertive' : 'polite'}
                      aria-atomic="true"
                      className={secretFeedback ? (secretFeedback.isError ? styles.errorMsg : styles.muted) : undefined}
                      style={{ fontSize: '0.8125rem' }}
                    >
                      {secretFeedback?.msg ?? ''}
                    </span>
                  </div>
                </div>
              </div>
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
            <p>The model in use is set by the <code>OLLAMA_MODEL</code> environment variable on the scraper service (default: <code>llama3.2</code>). Installed and loaded model stats come from the Ollama instance at the API&apos;s configured <code>OLLAMA_BASE_URL</code>.</p>
          </div>
        </details>
      </div>
    </main>
  )
}
