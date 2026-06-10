'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import styles from '../ops.module.css'
import logsStyles from './logs.module.css'

interface LogEntry {
  ts: string
  level: string | null
  service: string | null
  message: string | null
  requestId: string | null
  queue: string | null
  jobId: string | null
  sourceId: string | null
  stack: string | null
  extra: Record<string, unknown>
}

interface LogsClientProps {
  apiBaseUrl: string
}

type LevelFilter = 'all' | 'error' | 'warn' | 'info' | 'debug'

const LEVEL_PRIORITY: Record<string, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

function levelVariant(level: string | null): string {
  switch (level) {
    case 'fatal':
    case 'error':
      return 'danger'
    case 'warn':
      return 'warning'
    case 'info':
      return 'neutral'
    case 'debug':
    case 'trace':
      return 'muted'
    default:
      return 'neutral'
  }
}

function fmtTs(ts: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ts))
}

function hasDetails(entry: LogEntry): boolean {
  return !!(entry.stack ?? (Object.keys(entry.extra).length > 0 && entry.level === 'error'))
}

function EntryDetails({ entry }: { entry: LogEntry }) {
  const extraKeys = Object.keys(entry.extra)
  return (
    <div className={logsStyles.entryDetails}>
      {entry.stack ? (
        <div className={logsStyles.detailSection}>
          <p className={logsStyles.detailLabel}>Stack trace</p>
          <pre className={styles.miniCode}>{entry.stack}</pre>
        </div>
      ) : null}
      {extraKeys.length > 0 ? (
        <div className={logsStyles.detailSection}>
          <p className={logsStyles.detailLabel}>Context</p>
          <pre className={styles.miniCode}>{JSON.stringify(entry.extra, null, 2)}</pre>
        </div>
      ) : null}
    </div>
  )
}

interface EntryRowProps {
  entry: LogEntry
}

function EntryRow({ entry }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false)
  const expandable = hasDetails(entry)

  return (
    <>
      <tr
        className={expandable ? logsStyles.expandableRow : undefined}
      >
        <td className={`${styles.muted} ${logsStyles.tsCell}`}>{fmtTs(entry.ts)}</td>
        <td>
          <span
            className={styles.badge}
            data-variant={levelVariant(entry.level)}
          >
            {entry.level ?? '—'}
          </span>
        </td>
        <td className={logsStyles.serviceCell}>
          {entry.service ? (
            <code className={logsStyles.mono}>{entry.service}</code>
          ) : (
            <span className={styles.muted}>—</span>
          )}
        </td>
        <td className={logsStyles.msgCell}>
          <span className={logsStyles.msgText}>{entry.message ?? '—'}</span>
          {entry.requestId ? (
            <span className={logsStyles.metaChip}>req:{entry.requestId.slice(0, 8)}</span>
          ) : null}
          {entry.queue ? (
            <span className={logsStyles.metaChip}>q:{entry.queue}</span>
          ) : null}
          {entry.jobId ? (
            <span className={logsStyles.metaChip}>job:{entry.jobId.slice(0, 8)}</span>
          ) : null}
          {entry.sourceId ? (
            <span className={logsStyles.metaChip}>src:{entry.sourceId.slice(0, 8)}</span>
          ) : null}
        </td>
        <td className={logsStyles.expandCell}>
          {expandable ? (
            <button
              type="button"
              className={logsStyles.expandBtn}
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
              aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? '▲' : '▼'}
            </button>
          ) : null}
        </td>
      </tr>
      {expanded && expandable ? (
        <tr className={logsStyles.detailRow}>
          <td colSpan={5}>
            <EntryDetails entry={entry} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function LogsClient({ apiBaseUrl }: LogsClientProps) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null)
  const [services, setServices] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce the search input — only fire query after 400 ms idle
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setUnavailable(false)

    const params = new URLSearchParams({ limit: '200' })
    if (serviceFilter !== 'all') params.set('service', serviceFilter)
    if (debouncedSearch) params.set('search', debouncedSearch)

    try {
      const res = await fetch(`${apiBaseUrl}/admin/logs?${params.toString()}`, { cache: 'no-store' })
      if (res.status === 503) {
        setUnavailable(true)
        setEntries(null)
        return
      }
      if (!res.ok) throw new Error(`API returned ${res.status}`)
      const body = (await res.json()) as { data: { entries: LogEntry[]; services: string[] } }
      setEntries(body.data.entries)
      setServices(prev => {
        // Merge new services into existing known set
        const merged = new Set([...prev, ...body.data.services])
        return [...merged].sort()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs')
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl, serviceFilter, debouncedSearch])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!entries) return null
    if (levelFilter === 'all') return entries
    return entries.filter(e => {
      if (!e.level) return false
      const priority = LEVEL_PRIORITY[e.level] ?? 99
      const threshold = LEVEL_PRIORITY[levelFilter] ?? 99
      return priority <= threshold
    })
  }, [entries, levelFilter])

  const counts = useMemo(() => {
    if (!entries) return { error: 0, warn: 0, info: 0 }
    return {
      error: entries.filter(e => e.level === 'error' || e.level === 'fatal').length,
      warn: entries.filter(e => e.level === 'warn').length,
      info: entries.filter(e => e.level === 'info').length,
    }
  }, [entries])

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>Logs</h1>
            <p className={styles.pageIntro}>Application log stream — last hour across all services.</p>
          </div>
          <Link href="/ops" className={styles.backLink}>← Operations</Link>
        </div>

        {/* Controls bar */}
        <div className={styles.controlsBar}>
          {/* Service filter */}
          <label className={styles.srOnly} htmlFor="service-select">Filter by service</label>
          <select
            id="service-select"
            className={styles.select}
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
          >
            <option value="all">All services</option>
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Level filter pills */}
          <div className={styles.filterGroup} role="group" aria-label="Filter by log level">
            {(['all', 'error', 'warn', 'info', 'debug'] as LevelFilter[]).map(lvl => (
              <button
                key={lvl}
                type="button"
                className={styles.filterPill}
                data-active={levelFilter === lvl ? 'true' : 'false'}
                onClick={() => setLevelFilter(lvl)}
              >
                {lvl === 'all' ? `All (${entries?.length ?? 0})` : null}
                {lvl === 'error' ? `Errors (${counts.error})` : null}
                {lvl === 'warn' ? `Warn (${counts.warn})` : null}
                {lvl === 'info' ? `Info (${counts.info})` : null}
                {lvl === 'debug' ? 'Debug+' : null}
              </button>
            ))}
          </div>

          <div className={styles.controlsBarRight}>
            {/* Search */}
            <label className={styles.srOnly} htmlFor="log-search">Search messages</label>
            <input
              id="log-search"
              type="search"
              className={styles.input}
              placeholder="Search messages…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '14rem' }}
            />
            <button
              className={`${styles.btn} ${styles.btnGhost}`}
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
            >
              {isLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Status messages */}
        {unavailable ? (
          <div className={logsStyles.unavailable} role="status">
            <strong>Log backend unavailable.</strong>
            {' '}Start the Loki service to query application logs:{' '}
            <code className={logsStyles.mono}>docker compose --profile obs up</code>
          </div>
        ) : error ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : !filtered ? (
          <p className={styles.empty} role="status">Loading logs…</p>
        ) : filtered.length === 0 ? (
          <p className={styles.empty} role="status">
            No log entries found
            {levelFilter !== 'all' ? ` at ${levelFilter} level or above` : ''}
            {debouncedSearch ? ` matching "${debouncedSearch}"` : ''}
            {serviceFilter !== 'all' ? ` for service "${serviceFilter}"` : ''}
            {'.'}
          </p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table} aria-label="Application log entries">
              <caption className={styles.srOnly}>
                {filtered.length} log {filtered.length === 1 ? 'entry' : 'entries'}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Level</th>
                  <th scope="col">Service</th>
                  <th scope="col">Message</th>
                  <th scope="col"><span className={styles.srOnly}>Details</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  // Entries don't have a stable unique id, use ts+index
                  <EntryRow key={`${entry.ts}-${i}`} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className={styles.helpPanel}>
          <summary>About this page</summary>
          <div className={styles.helpBody}>
            <p>
              This page queries <strong>Loki</strong> (the local log aggregation backend) for the most recent
              200 log lines across all services. Logs are structured JSON emitted by <code>pino</code> in the
              API, scraper, and queue worker processes, then collected by Grafana Alloy.
            </p>
            <ul>
              <li><strong>Service</strong> — the process that emitted the line (api, scraper, worker, etc.)</li>
              <li><strong>requestId</strong> — correlates multiple lines from a single HTTP request</li>
              <li><strong>queue / jobId</strong> — correlates lines from a BullMQ job execution</li>
              <li><strong>sourceId</strong> — the data source being scraped when the line was emitted</li>
            </ul>
            <p>
              For historical queries and dashboards use{' '}
              <a href="http://localhost:3003" target="_blank" rel="noreferrer" style={{ color: 'var(--clr-primary)' }}>
                Grafana
              </a>
              {' '}(available when the obs profile is running).
            </p>
          </div>
        </details>
      </div>
    </main>
  )
}
