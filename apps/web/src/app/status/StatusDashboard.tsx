'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HealthResponse, ServiceHealth, ServiceStatus } from '@wav-search/types'
import styles from './page.module.css'

const REFRESH_INTERVAL_MS = 30_000

type RowStatus = ServiceStatus | 'unknown'

interface StatusRow {
  id: string
  name: string
  detail: string
  status: RowStatus
}

interface StatusDashboardProps {
  apiBaseUrl: string
}

export function StatusDashboard({ apiBaseUrl }: StatusDashboardProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    const started = performance.now()

    try {
      const response = await fetch(`${apiBaseUrl}/health`, { cache: 'no-store' })
      const latencyMs = Math.round(performance.now() - started)
      if (!response.ok) throw new Error(`Health check failed with ${response.status}`)
      const data = (await response.json()) as HealthResponse
      setHealth(data)
      setApiLatencyMs(latencyMs)
      setError(null)
      setUpdatedAt(new Date())
    } catch (err) {
      setHealth(null)
      setApiLatencyMs(null)
      setError(err instanceof Error ? err.message : 'API is unreachable')
      setUpdatedAt(new Date())
    } finally {
      setIsRefreshing(false)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [refresh])

  const rows = useMemo<StatusRow[]>(() => {
    const apiStatus: RowStatus = error ? 'down' : health ? latencyToStatus(apiLatencyMs) : 'unknown'
    const services = health?.services

    return [
      {
        id: 'web',
        name: 'Web',
        status: 'up',
        detail: 'Status page loaded',
      },
      {
        id: 'api',
        name: 'API',
        status: apiStatus,
        detail: apiLatencyMs == null ? 'Health endpoint unavailable' : `${apiLatencyMs} ms response`,
      },
      toRow('postgres', 'PostgreSQL', services?.postgres),
      toRow('meilisearch', 'Meilisearch', services?.meilisearch),
      toRow('valkey', 'Valkey', services?.valkey),
      toRow('scraper', 'Scraper', services?.scraper),
      toRow('ollama', 'Ollama', services?.ollama),
    ]
  }, [apiLatencyMs, error, health])

  const overallStatus = error ? 'down' : health?.status ?? 'degraded'
  const overallLabel = overallStatus === 'ok' ? 'All systems operational' : overallStatus === 'degraded' ? 'Some systems degraded' : 'Service disruption'

  return (
    <section className={styles.statusPanel} aria-labelledby="status-heading">
      <div className={styles.summary}>
        <div>
          <h1 id="status-heading" className={styles.heading}>
            System status
          </h1>
          <p className={styles.summaryText}>{overallLabel}</p>
          {error ? <p className={styles.errorText}>API health check failed: {error}</p> : null}
        </div>
        <div className={styles.actions}>
          <p className={styles.updatedAt} aria-live="polite">
            {updatedAt ? `Updated ${formatTime(updatedAt)}` : 'Checking status...'}
          </p>
          <button className={styles.refreshButton} type="button" onClick={() => void refresh()} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className={styles.statusList} role="list" aria-label="Service health">
        {rows.map(row => (
          <div className={styles.statusRow} role="listitem" key={row.id}>
            <div className={styles.serviceNameGroup}>
              <span className={styles.indicator} data-status={row.status} aria-hidden="true" />
              <span className={styles.serviceName}>{row.name}</span>
            </div>
            <span className={styles.statusLabel} data-status={row.status}>
              {formatStatus(row.status)}
            </span>
            <span className={styles.detailText}>{row.detail}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function toRow(id: keyof HealthResponse['services'], name: string, health?: ServiceHealth): StatusRow {
  return {
    id,
    name,
    status: health?.status ?? 'unknown',
    detail: formatDetail(health),
  }
}

function formatDetail(health?: ServiceHealth): string {
  if (!health) return 'Waiting for API data'
  if (health.message) return health.message
  if (health.lastRunAt) return `Last successful run ${formatDateTime(health.lastRunAt)}`
  if (health.latencyMs != null) return `${health.latencyMs} ms response`
  return 'No successful response'
}

function latencyToStatus(latencyMs: number | null): RowStatus {
  if (latencyMs == null) return 'unknown'
  return latencyMs > 1000 ? 'degraded' : 'up'
}

function formatStatus(status: RowStatus): string {
  if (status === 'optional_offline') return 'OPTIONAL OFFLINE'
  return status.toUpperCase()
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
