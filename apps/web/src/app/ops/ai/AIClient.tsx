'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'
import { MODEL_CATALOG, JOB_RECOMMENDATIONS } from './model-catalog'

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

const PROVIDERS = ['ollama'] as const
type Provider = (typeof PROVIDERS)[number]

// AI job definitions — structure supports multiple providers; Ollama is the only active one
const AI_JOBS = [
  { id: 'intake',            label: 'Intake (search assistant)', providerKey: 'ai.intake.provider',            modelKey: 'ai.intake.model' },
  { id: 'scraper.structure', label: 'Scraper — structure detect', providerKey: 'ai.scraper.structure.provider', modelKey: 'ai.scraper.structure.model' },
  { id: 'scraper.remap',     label: 'Scraper — field remap',     providerKey: 'ai.scraper.remap.provider',     modelKey: 'ai.scraper.remap.model' },
  { id: 'agents',            label: 'Agent pipeline',            providerKey: 'ai.agents.provider',            modelKey: 'ai.agents.model' },
] as const

interface AIClientProps {
  apiBaseUrl: string
}

const REFRESH_MS = 30_000

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDate(val: string | null): string {
  if (!val) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(val))
}

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
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
  return `${Math.round(minutes / 60)} hr`
}

// ── Model selector ────────────────────────────────────────────────────────────

const CUSTOM_VALUE = '__custom__'

interface ModelSelectorProps {
  jobId: string
  currentValue: string
  installedModels: string[]
  ollamaAvailable: boolean
  disabled: boolean
  onSave: (value: string) => void
}

function ModelSelector({
  jobId, currentValue, installedModels, ollamaAvailable, disabled, onSave,
}: ModelSelectorProps) {
  const recommendations = JOB_RECOMMENDATIONS[jobId] ?? []
  const topRec = recommendations[0]

  const [selectValue, setSelectValue] = useState<string>(() => {
    const inCatalog = MODEL_CATALOG.some(m => m.name === currentValue)
    const inInstalled = installedModels.includes(currentValue)
    return inCatalog || inInstalled ? (currentValue || '') : (currentValue ? CUSTOM_VALUE : '')
  })
  const [customValue, setCustomValue] = useState(
    selectValue === CUSTOM_VALUE ? currentValue : '',
  )

  // Re-sync when config loads (key prop on ModelSelector handles full resets)
  const effectiveModel = selectValue === CUSTOM_VALUE ? customValue : selectValue

  // Partition installed models
  const catalogNames = new Set(MODEL_CATALOG.map(m => m.name))
  const installedInCatalog = installedModels.filter(m => catalogNames.has(m))
  const installedCustom = installedModels.filter(m => !catalogNames.has(m))
  const notInstalled = MODEL_CATALOG.filter(m => !installedModels.includes(m.name))

  const selectedInfo = MODEL_CATALOG.find(m => m.name === effectiveModel)
  const isInstalled = installedModels.includes(effectiveModel)
  const recIndex = recommendations.indexOf(effectiveModel)
  const isTopRec = effectiveModel === topRec

  function optionLabel(name: string, installed: boolean): string {
    const info = MODEL_CATALOG.find(m => m.name === name)
    const rec = name === topRec ? '★ ' : ''
    const dl = installed ? '' : '⬇ '
    const size = info ? ` — ${info.paramBillions}B · ~${info.sizeGB} GB` : ''
    return `${rec}${dl}${info?.label ?? name}${size}`
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    setSelectValue(val)
    if (val !== CUSTOM_VALUE) onSave(val)
  }

  function handleCustomBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.target.value.trim()
    if (val && val !== currentValue) onSave(val)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <select
        aria-label={`Model for ${jobId}`}
        value={selectValue}
        disabled={disabled}
        onChange={handleSelectChange}
        style={{
          height: '2rem',
          padding: '0 0.5rem',
          border: '1px solid var(--clr-border-strong)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--clr-bg)',
          color: 'var(--clr-text)',
          fontFamily: 'var(--font)',
          fontSize: '0.875rem',
          maxWidth: '22rem',
        }}
      >
        <option value="">— use default —</option>

        {/* Installed models */}
        {installedModels.length > 0 && (
          <optgroup label="Installed">
            {installedInCatalog.map(name => (
              <option key={name} value={name}>{optionLabel(name, true)}</option>
            ))}
            {installedCustom.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
        )}

        {/* Catalog models not yet installed */}
        {notInstalled.length > 0 && (
          <optgroup label={ollamaAvailable ? 'Available to download' : 'Catalog (Ollama offline)'}>
            {notInstalled.map(m => (
              <option key={m.name} value={m.name}>{optionLabel(m.name, false)}</option>
            ))}
          </optgroup>
        )}

        <option value={CUSTOM_VALUE}>Custom model name…</option>
      </select>

      {/* Custom name input */}
      {selectValue === CUSTOM_VALUE && (
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. llama3.2:latest"
          defaultValue={customValue}
          disabled={disabled}
          style={{ maxWidth: '22rem' }}
          onChange={e => setCustomValue(e.target.value)}
          onBlur={handleCustomBlur}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label="Custom model name"
        />
      )}

      {/* Model info */}
      {effectiveModel && (
        <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)', lineHeight: 1.5, maxWidth: '22rem' }}>
          {selectedInfo ? (
            <>
              <span>{selectedInfo.description}</span>
              {isTopRec && (
                <span style={{ marginLeft: '0.35rem', color: 'var(--clr-primary)', fontWeight: 700 }}>
                  ★ Recommended for this job.
                </span>
              )}
              {!isTopRec && recIndex > 0 && (
                <span style={{ marginLeft: '0.35rem', fontWeight: 600 }}>
                  (#{recIndex + 1} choice for this job.)
                </span>
              )}
              {' '}
              {isInstalled ? (
                <span style={{ color: 'var(--clr-success-text)', fontWeight: 600 }}>✓ Installed.</span>
              ) : (
                <span style={{ color: 'var(--clr-warning-text)', fontWeight: 600 }}>
                  ⬇ Not yet downloaded. Run{' '}
                  <code style={{ userSelect: 'all', background: 'var(--clr-surface)', padding: '0.1em 0.3em', borderRadius: '3px', fontWeight: 400 }}>
                    ollama pull {effectiveModel}
                  </code>
                  {' '}in your terminal first, then refresh this page.
                </span>
              )}
            </>
          ) : isInstalled ? (
            <span style={{ color: 'var(--clr-success-text)', fontWeight: 600 }}>✓ Installed.</span>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIClient({ apiBaseUrl }: AIClientProps) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [runStates, setRunStates] = useState<Record<string, RunState>>({})

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
      // best-effort
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
      const res = await fetch(`${apiBaseUrl}/admin/sources/${encodeURIComponent(sourceId)}/run`, { method: 'POST' })
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

  const installedModels = status?.ollama.models ?? []
  const ollamaAvailable = status?.ollama.available ?? false
  const loadedCount = status?.ollama.runningModels.length ?? 0
  const totalModelMemory = status?.ollama.runningModels.reduce((s, m) => s + (m.sizeBytes ?? 0), 0) ?? 0
  const totalVramMemory = status?.ollama.runningModels.reduce((s, m) => s + (m.vramBytes ?? 0), 0) ?? 0

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
            {/* ── Ollama status ──────────────────────────── */}
            <section className={styles.statusCard} aria-label="Ollama status">
              <div className={styles.statusCardHead}>
                <h2 className={styles.activityTitle}>Ollama</h2>
                <span className={styles.badge} data-variant={ollamaAvailable ? 'success' : 'danger'}>
                  {ollamaAvailable ? 'Available' : 'Unavailable'}
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
                    {installedModels.length === 0 ? (
                      <span className={styles.muted}>None detected</span>
                    ) : (
                      installedModels.map(m => (
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
                    <p className={styles.emptyCompact}>No models currently loaded in Ollama memory.</p>
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
                {!ollamaAvailable && (
                  <p className={styles.errorMsg} style={{ margin: 0 }}>
                    Ollama is not reachable at the configured URL. All AI features will fall back to empty results until it is restored.
                  </p>
                )}
              </div>
            </section>

            {/* ── Sources needing remapping ──────────────── */}
            <section style={{ marginTop: '1.75rem' }}>
              <h2 className={styles.sectionHeading}>
                Sources needing remapping
                {status.sourcesNeedingRemap.length > 0 && (
                  <span className={styles.badge} data-variant="danger" style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>
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
                      <tr><th>Source</th><th>Last Scraped</th><th>Error</th><th>Actions</th></tr>
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
                                  <span className={rs.isError ? styles.errorMsg : styles.muted} style={{ fontSize: '0.75rem' }}>
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

            {/* ── Provider & Model Configuration ────────── */}
            <section style={{ marginTop: '1.75rem' }} aria-labelledby="provider-config-heading">
              <h2 id="provider-config-heading" className={styles.sectionHeading}>Provider &amp; Model Configuration</h2>
              <p className={styles.sectionIntro}>
                Select the AI provider and model for each job. ★ marks the recommended model.
                ⬇ marks models in the catalog that aren&apos;t yet downloaded.
              </p>
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
                      const saving = !!(configSaving[job.providerKey] || configSaving[job.modelKey])

                      return (
                        <tr key={job.id}>
                          <td style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: '0.9rem' }}>
                            {job.label}
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: '0.75rem' }}>
                            <select
                              aria-label={`Provider for ${job.label}`}
                              value={currentProvider}
                              disabled={saving}
                              onChange={e => void saveConfigValue(job.providerKey, e.target.value)}
                              style={{
                                height: '2rem',
                                padding: '0 0.5rem',
                                border: '1px solid var(--clr-border-strong)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--clr-bg)',
                                color: 'var(--clr-text)',
                                fontFamily: 'var(--font)',
                                fontSize: '0.875rem',
                              }}
                            >
                              <option value="">— not set —</option>
                              {PROVIDERS.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: '0.75rem' }}>
                            {/* When provider is ollama (or unset, defaulting to ollama), show smart selector */}
                            {(!currentProvider || currentProvider === 'ollama') ? (
                              <ModelSelector
                                key={currentModel}
                                jobId={job.id}
                                currentValue={currentModel}
                                installedModels={installedModels}
                                ollamaAvailable={ollamaAvailable}
                                disabled={saving}
                                onSave={val => void saveConfigValue(job.modelKey, val)}
                              />
                            ) : (
                              <input
                                aria-label={`Model for ${job.label}`}
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
                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                placeholder="Model name"
                                style={{ width: '18rem' }}
                              />
                            )}
                          </td>
                          <td style={{ verticalAlign: 'top', paddingTop: '0.9rem' }}>
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
          </>
        )}

        <details className={styles.helpPanel}>
          <summary>How AI fits into WAV Search</summary>
          <div className={styles.helpBody}>
            <p>WAV Search uses a local <strong>Ollama</strong> instance for all AI features:</p>
            <ol>
              <li>
                <strong>Intake</strong> — The home page search assistant interprets plain-language descriptions
                into structured filters. Test it at <a href="/ops/intake">Ops → Intake Test</a>.
              </li>
              <li>
                <strong>Structure detection</strong> — Before each scrape, the engine hashes the DOM of a
                sample page. A changed hash triggers remapping.
              </li>
              <li>
                <strong>Field remapping</strong> — The AI receives previous CSS selector mappings and the new
                HTML, then outputs updated selectors. High-confidence results are saved automatically; lower
                confidence sends the source to the remapping queue.
              </li>
            </ol>
            <p>
              The model for each job defaults to <code>llama3.2</code>. Override it above.
              Ollama must be running and the chosen model must be pulled before AI features work — the
              model selector shows the exact <code>ollama pull &lt;model&gt;</code> command when a
              not-yet-downloaded model is selected. The base URL is set via <code>OLLAMA_BASE_URL</code>.
              The ⬇ pull UI is tracked in issue <a href="https://github.com/NoAccountNeeded-Lab/WivWav/issues/250" target="_blank" rel="noreferrer">#250</a>.
            </p>
          </div>
        </details>
      </div>
    </main>
  )
}
