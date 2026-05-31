'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'

interface ScheduleEntry {
  id: string
  queue: string
  jobId: string | null
  label: string
  name: string
  data: Record<string, unknown>
  defaultPattern: string
  tz: string
  enabled: boolean
  key: string | null
  pattern: string
  next: number | null
}

interface SchedulesClientProps {
  apiBaseUrl: string
}

interface EditState {
  id: string
  pattern: string
}

interface ActionState {
  loading: boolean
  feedback: string | null
  isError: boolean
}

const REFRESH_MS = 30_000

export function SchedulesClient({ apiBaseUrl }: SchedulesClientProps) {
  const [schedules, setSchedules] = useState<ScheduleEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})
  const [editState, setEditState] = useState<EditState | null>(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(`${apiBaseUrl}/admin/repeatables`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: ScheduleEntry[] }
      setSchedules(body.data)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules')
    } finally {
      setIsRefreshing(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh])

  function setAction(id: string, state: ActionState) {
    setActionStates((prev) => ({ ...prev, [id]: state }))
  }

  async function disable(entry: ScheduleEntry) {
    if (!entry.key) return
    setAction(entry.id, { loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/repeatables/${encodeURIComponent(entry.queue)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: entry.key }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setAction(entry.id, { loading: false, feedback: 'Disabled', isError: false })
      setTimeout(() => void refresh(), 500)
    } catch (err) {
      setAction(entry.id, { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  async function enable(entry: ScheduleEntry, pattern?: string) {
    setAction(entry.id, { loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/repeatables/${encodeURIComponent(entry.queue)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: entry.name,
          data: entry.data,
          pattern: pattern ?? entry.pattern,
          tz: entry.tz,
          jobId: entry.jobId ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setAction(entry.id, { loading: false, feedback: 'Enabled', isError: false })
      setEditState(null)
      setTimeout(() => void refresh(), 500)
    } catch (err) {
      setAction(entry.id, { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  async function updatePattern(entry: ScheduleEntry, newPattern: string) {
    if (!entry.key) { await enable(entry, newPattern); return }
    setAction(entry.id, { loading: true, feedback: null, isError: false })
    try {
      const res = await fetch(`${apiBaseUrl}/admin/repeatables/${encodeURIComponent(entry.queue)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: entry.key,
          name: entry.name,
          data: entry.data,
          pattern: newPattern,
          tz: entry.tz,
          jobId: entry.jobId ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setAction(entry.id, { loading: false, feedback: 'Updated', isError: false })
      setEditState(null)
      setTimeout(() => void refresh(), 500)
    } catch (err) {
      setAction(entry.id, { loading: false, feedback: err instanceof Error ? err.message : 'Error', isError: true })
    }
  }

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Schedules</h1>
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
        ) : !schedules ? (
          <p className={styles.empty}>Loading schedules…</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Queue</th>
                  <th>Pattern</th>
                  <th>Timezone</th>
                  <th>Next run</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((entry) => {
                  const act = actionStates[entry.id]
                  const isEditing = editState?.id === entry.id

                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className={styles.queueName} style={{ fontWeight: 500 }}>{entry.label}</div>
                        <div className={styles.queueDesc} style={{ fontSize: '0.75rem' }}>
                          {entry.name}{entry.jobId ? ` · ${entry.jobId}` : ''}
                        </div>
                      </td>
                      <td><code style={{ fontSize: '0.8125rem' }}>{entry.queue}</code></td>
                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              className={styles.input}
                              value={editState.pattern}
                              onChange={(e) => setEditState({ id: entry.id, pattern: e.target.value })}
                              style={{ fontFamily: 'monospace', fontSize: '0.8125rem', width: '10rem' }}
                              aria-label="Cron pattern"
                            />
                            <button
                              className={`${styles.btn} ${styles.btnPrimary}`}
                              style={{ padding: '0.25rem 0.625rem', fontSize: '0.8125rem' }}
                              type="button"
                              disabled={act?.loading}
                              onClick={() => void updatePattern(entry, editState.pattern)}
                            >
                              Save
                            </button>
                            <button
                              className={`${styles.btn} ${styles.btnGhost}`}
                              style={{ padding: '0.25rem 0.625rem', fontSize: '0.8125rem' }}
                              type="button"
                              onClick={() => setEditState(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <code style={{ fontSize: '0.8125rem' }}>{entry.pattern}</code>
                        )}
                      </td>
                      <td className={styles.muted} style={{ fontSize: '0.8125rem' }}>{entry.tz}</td>
                      <td className={styles.muted} style={{ fontSize: '0.8125rem' }}>
                        {entry.next ? fmtDateTime(entry.next) : '—'}
                      </td>
                      <td>
                        <span
                          className={styles.badge}
                          data-variant={entry.enabled ? 'success' : 'neutral'}
                        >
                          {entry.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          {entry.enabled ? (
                            <button
                              className={`${styles.btn} ${styles.btnGhost}`}
                              type="button"
                              disabled={act?.loading}
                              onClick={() => void disable(entry)}
                            >
                              {act?.loading ? '…' : 'Disable'}
                            </button>
                          ) : (
                            <button
                              className={`${styles.btn} ${styles.btnPrimary}`}
                              type="button"
                              disabled={act?.loading}
                              onClick={() => void enable(entry)}
                            >
                              {act?.loading ? '…' : 'Enable'}
                            </button>
                          )}
                          {!isEditing && (
                            <button
                              className={`${styles.btn} ${styles.btnGhost}`}
                              type="button"
                              disabled={act?.loading}
                              onClick={() => setEditState({ id: entry.id, pattern: entry.pattern })}
                            >
                              Edit
                            </button>
                          )}
                          {act?.feedback && (
                            <span className={act.isError ? styles.errorMsg : styles.muted} style={{ fontSize: '0.75rem' }}>
                              {act.feedback}
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
          <summary>How schedules work</summary>
          <div className={styles.helpBody}>
            <p>Schedules are stored in <strong>Valkey (Redis)</strong> by BullMQ — not in node-cron or any config file. The scraper process registers defaults on first boot; from then on, what you see here is what runs.</p>
            <ul>
              <li><strong>Disable</strong> removes the repeatable from BullMQ. The job won't fire until re-enabled. A scraper restart will not re-add it.</li>
              <li><strong>Enable</strong> adds it back with the same (or default) pattern.</li>
              <li><strong>Edit</strong> lets you change the cron pattern without restarting anything. Changes take effect immediately — the next run is rescheduled in BullMQ.</li>
            </ul>
            <p>Cron syntax: <code>minute hour day-of-month month day-of-week</code>. Examples: <code>0 2 * * *</code> = 2 AM daily, <code>*/5 * * * *</code> = every 5 minutes, <code>0 */6 * * *</code> = every 6 hours.</p>
            <p>To trigger a job immediately without waiting for the schedule, use the <Link href="/ops/queues" style={{ color: 'var(--clr-primary)' }}>Queues page</Link>.</p>
          </div>
        </details>
      </div>
    </main>
  )
}

function fmtTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(date)
}

function fmtDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(ms))
}
