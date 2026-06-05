'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'
import { buildSecretRequest } from './config-helpers'

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

const AI_JOBS = [
  {
    id: 'intake',
    label: 'Intake',
    description: 'Natural-language search assistant.',
    providerKey: 'ai.intake.provider',
    modelKey: 'ai.intake.model',
    apiKeyIdKey: 'ai.intake.apiKeyId',
  },
  {
    id: 'scraper.structure',
    label: 'Scraper structure',
    description: 'Detects source layout changes before scraping.',
    providerKey: 'ai.scraper.structure.provider',
    modelKey: 'ai.scraper.structure.model',
    apiKeyIdKey: 'ai.scraper.structure.apiKeyId',
  },
  {
    id: 'scraper.remap',
    label: 'Scraper remap',
    description: 'Remaps selectors when a source layout changes.',
    providerKey: 'ai.scraper.remap.provider',
    modelKey: 'ai.scraper.remap.model',
    apiKeyIdKey: 'ai.scraper.remap.apiKeyId',
  },
  {
    id: 'agents',
    label: 'Agent pipeline',
    description: 'Review and worker agent completion provider.',
    providerKey: 'ai.agents.provider',
    modelKey: 'ai.agents.model',
    apiKeyIdKey: 'ai.agents.apiKeyId',
  },
] as const

const PROVIDERS = ['anthropic', 'ollama'] as const

type AIJob = (typeof AI_JOBS)[number]
type AIJobId = AIJob['id']

interface DraftConfig {
  provider: string
  model: string
  apiKeyId: string
}

interface SaveState {
  loading: boolean
  message: string
  isError: boolean
}

interface ConfigClientProps {
  apiBaseUrl: string
}

function entryValue(entries: ConfigEntry[], key: string): string {
  const entry = entries.find(item => item.key === key)
  if (!entry || entry.value === null) return ''
  return String(entry.value)
}

function buildDrafts(entries: ConfigEntry[]): Record<AIJobId, DraftConfig> {
  return AI_JOBS.reduce((drafts, job) => {
    drafts[job.id] = {
      provider: entryValue(entries, job.providerKey),
      model: entryValue(entries, job.modelKey),
      apiKeyId: entryValue(entries, job.apiKeyIdKey),
    }
    return drafts
  }, {} as Record<AIJobId, DraftConfig>)
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function ConfigClient({ apiBaseUrl }: ConfigClientProps) {
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [drafts, setDrafts] = useState<Record<AIJobId, DraftConfig>>(() => buildDrafts([]))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})

  const [newSecretKey, setNewSecretKey] = useState('')
  const [newSecretValue, setNewSecretValue] = useState('')
  const [newSecretDescription, setNewSecretDescription] = useState('')

  const secrets = useMemo(
    () => entries.filter(entry => entry.type === 'secret').sort((a, b) => a.key.localeCompare(b.key)),
    [entries],
  )

  const refreshConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/config`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Config API returned ${res.status}`)
      const body = (await res.json()) as { data: ConfigEntry[] }
      setEntries(body.data)
      setDrafts(buildDrafts(body.data))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load config entries')
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refreshConfig()
  }, [refreshConfig])

  function updateDraft(jobId: AIJobId, field: keyof DraftConfig, value: string) {
    setDrafts(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        [field]: value,
      },
    }))
  }

  async function writeConfigValue(key: string, value: string) {
    if (value.trim() === '') {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`Failed to unset ${key} (${res.status})`)
      return
    }

    const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value.trim(), type: 'string' }),
    })
    if (!res.ok) throw new Error(`Failed to save ${key} (${res.status})`)
  }

  async function saveJob(job: AIJob) {
    const draft = drafts[job.id]
    setSaveStates(prev => ({
      ...prev,
      [job.id]: { loading: true, message: 'Saving...', isError: false },
    }))

    try {
      await Promise.all([
        writeConfigValue(job.providerKey, draft.provider),
        writeConfigValue(job.modelKey, draft.model),
        writeConfigValue(job.apiKeyIdKey, draft.apiKeyId),
      ])
      await refreshConfig()
      setSaveStates(prev => ({
        ...prev,
        [job.id]: { loading: false, message: 'Saved', isError: false },
      }))
    } catch (err) {
      setSaveStates(prev => ({
        ...prev,
        [job.id]: {
          loading: false,
          message: err instanceof Error ? err.message : 'Save failed',
          isError: true,
        },
      }))
    }
  }

  async function saveSecret() {
    const request = buildSecretRequest(newSecretKey, newSecretValue, newSecretDescription)
    if (!request) {
      setSaveStates(prev => ({
        ...prev,
        secret: { loading: false, message: 'Secret key and value are required', isError: true },
      }))
      return
    }

    setSaveStates(prev => ({
      ...prev,
      secret: { loading: true, message: 'Storing...', isError: false },
    }))

    try {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(request.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.payload),
      })
      if (!res.ok) throw new Error(`Failed to store secret (${res.status})`)
      setNewSecretKey('')
      setNewSecretValue('')
      setNewSecretDescription('')
      await refreshConfig()
      setSaveStates(prev => ({
        ...prev,
        secret: { loading: false, message: 'Secret stored', isError: false },
      }))
    } catch (err) {
      setSaveStates(prev => ({
        ...prev,
        secret: {
          loading: false,
          message: err instanceof Error ? err.message : 'Secret save failed',
          isError: true,
        },
      }))
    }
  }

  async function deleteSecret(key: string) {
    setSaveStates(prev => ({
      ...prev,
      [`secret:${key}`]: { loading: true, message: 'Deleting...', isError: false },
    }))

    try {
      const res = await fetch(`${apiBaseUrl}/admin/config/${encodeURIComponent(key)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to delete secret (${res.status})`)
      await refreshConfig()
      setSaveStates(prev => ({
        ...prev,
        [`secret:${key}`]: { loading: false, message: 'Deleted', isError: false },
      }))
    } catch (err) {
      setSaveStates(prev => ({
        ...prev,
        [`secret:${key}`]: {
          loading: false,
          message: err instanceof Error ? err.message : 'Delete failed',
          isError: true,
        },
      }))
    }
  }

  function hasChanges(job: AIJob): boolean {
    const draft = drafts[job.id]
    return (
      draft.provider !== entryValue(entries, job.providerKey) ||
      draft.model !== entryValue(entries, job.modelKey) ||
      draft.apiKeyId !== entryValue(entries, job.apiKeyIdKey)
    )
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>AI Config</h1>
            <p className={styles.pageIntro}>Edit provider, model, and API key settings used by AI-powered jobs.</p>
          </div>
          <Link href="/ops" className={styles.backLink}>Operations</Link>
        </div>

        <div className={styles.controlsBar}>
          <span className={styles.refreshMeta}>
            {loading ? 'Loading config...' : `${entries.length} active config entries`}
          </span>
          <div className={styles.controlsBarRight}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => void refreshConfig()}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {loadError ? <p className={styles.error}>{loadError}</p> : null}

        <section aria-labelledby="ai-config-heading">
          <h2 id="ai-config-heading" className={styles.sectionHeading}>AI job settings</h2>
          <p className={styles.sectionIntro}>
            Empty fields are unset when saved. Secrets remain write-only; select their config key here.
          </p>

          <datalist id="secret-config-keys">
            {secrets.map(secret => (
              <option key={secret.key} value={secret.key} />
            ))}
          </datalist>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>API key ID</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {AI_JOBS.map(job => {
                  const draft = drafts[job.id]
                  const saveState = saveStates[job.id]
                  const dirty = hasChanges(job)

                  return (
                    <tr key={job.id}>
                      <td>
                        <div className={styles.queueNameWrap}>
                          <strong>{job.label}</strong>
                          <span className={styles.queueDesc}>{job.description}</span>
                        </div>
                      </td>
                      <td>
                        <label className={styles.srOnly} htmlFor={`${job.id}-provider`}>
                          Provider for {job.label}
                        </label>
                        <select
                          id={`${job.id}-provider`}
                          className={styles.select}
                          value={draft.provider}
                          onChange={event => updateDraft(job.id, 'provider', event.target.value)}
                        >
                          <option value="">Not set</option>
                          {PROVIDERS.map(provider => (
                            <option key={provider} value={provider}>{provider}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <label className={styles.srOnly} htmlFor={`${job.id}-model`}>
                          Model for {job.label}
                        </label>
                        <input
                          id={`${job.id}-model`}
                          className={styles.input}
                          type="text"
                          value={draft.model}
                          onChange={event => updateDraft(job.id, 'model', event.target.value)}
                          placeholder="e.g. claude-haiku-4-5-20251001"
                        />
                      </td>
                      <td>
                        <label className={styles.srOnly} htmlFor={`${job.id}-api-key-id`}>
                          API key config ID for {job.label}
                        </label>
                        <input
                          id={`${job.id}-api-key-id`}
                          className={styles.input}
                          type="text"
                          list="secret-config-keys"
                          value={draft.apiKeyId}
                          onChange={event => updateDraft(job.id, 'apiKeyId', event.target.value)}
                          placeholder="secret.anthropic.default"
                        />
                      </td>
                      <td>
                        <span
                          role={saveState?.isError ? 'alert' : 'status'}
                          aria-live={saveState?.isError ? 'assertive' : 'polite'}
                          aria-atomic="true"
                          className={saveState?.isError ? styles.errorMsg : styles.muted}
                        >
                          {saveState?.message ?? (dirty ? 'Unsaved changes' : 'Saved')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          onClick={() => void saveJob(job)}
                          disabled={!dirty || saveState?.loading}
                        >
                          {saveState?.loading ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.sectionBlock} aria-labelledby="secret-config-heading">
          <h2 id="secret-config-heading" className={styles.sectionHeading}>API key secrets</h2>
          <p className={styles.sectionIntro}>
            Store provider keys as encrypted config entries. Secret values cannot be read back from this UI.
          </p>

          {secrets.length === 0 ? (
            <p className={styles.emptyCompact}>No API key secrets are stored.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Config key</th>
                    <th>Description</th>
                    <th>Hint</th>
                    <th>Updated</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {secrets.map(secret => {
                    const saveState = saveStates[`secret:${secret.key}`]

                    return (
                      <tr key={secret.id}>
                        <td><code className={styles.inlineCode}>{secret.key}</code></td>
                        <td className={styles.muted}>{secret.description ?? '-'}</td>
                        <td><code className={styles.inlineCode}>...{secret.hint ?? '????'}</code></td>
                        <td className={styles.muted}>{displayDate(secret.createdAt)}</td>
                        <td>
                          <span
                            role={saveState?.isError ? 'alert' : 'status'}
                            aria-live={saveState?.isError ? 'assertive' : 'polite'}
                            aria-atomic="true"
                            className={saveState?.isError ? styles.errorMsg : styles.muted}
                          >
                            {saveState?.message ?? '-'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnDanger}`}
                            onClick={() => void deleteSecret(secret.key)}
                            disabled={saveState?.loading}
                          >
                            {saveState?.loading ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.formPanel}>
            <h3 className={styles.subsectionHeading}>Add or rotate API key</h3>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Config key</span>
                <input
                  type="text"
                  className={styles.input}
                  value={newSecretKey}
                  onChange={event => setNewSecretKey(event.target.value)}
                  placeholder="secret.anthropic.default"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>API key value</span>
                <input
                  type="password"
                  className={styles.input}
                  value={newSecretValue}
                  onChange={event => setNewSecretValue(event.target.value)}
                  placeholder="Write-only secret"
                  autoComplete="new-password"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Description</span>
                <input
                  type="text"
                  className={styles.input}
                  value={newSecretDescription}
                  onChange={event => setNewSecretDescription(event.target.value)}
                  placeholder="Anthropic production key"
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void saveSecret()}
                disabled={saveStates.secret?.loading}
              >
                {saveStates.secret?.loading ? 'Storing...' : 'Store key'}
              </button>
              <span
                role={saveStates.secret?.isError ? 'alert' : 'status'}
                aria-live={saveStates.secret?.isError ? 'assertive' : 'polite'}
                aria-atomic="true"
                className={saveStates.secret?.isError ? styles.errorMsg : styles.muted}
              >
                {saveStates.secret?.message ?? ''}
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
