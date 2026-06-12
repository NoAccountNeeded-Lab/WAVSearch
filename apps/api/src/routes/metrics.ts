import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wivwav/db'
import type { Redis } from 'ioredis'
import type { Meilisearch } from 'meilisearch'
import type { QueueFactory } from '@wivwav/queue'
import { QUEUES } from '@wivwav/queue'
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client'

export interface MetricsPluginOptions {
  db: PrismaClient
  cache: Redis
  meili: Meilisearch
  queueFactory: QueueFactory
  /** Pre-created registry shared with the root app so HTTP hooks can populate it from outside the plugin scope. */
  registry: Registry
}

/** Create the shared metrics registry and HTTP counters. Call this in the root app before registering metricsRoutes. */
export function createMetricsRegistry() {
  const registry = new Registry()
  collectDefaultMetrics({ register: registry })

  const httpRequests = new Counter({
    name: 'wivwav_http_requests_total',
    help: 'Total number of HTTP requests by method, route, and status class',
    labelNames: ['method', 'route', 'status_class'] as const,
    registers: [registry],
  })

  const httpDuration = new Histogram({
    name: 'wivwav_http_request_duration_ms',
    help: 'HTTP request latency in milliseconds',
    labelNames: ['method', 'route'] as const,
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [registry],
  })

  return { registry, httpRequests, httpDuration }
}

/**
 * GET /metrics — Prometheus text-format scrape endpoint.
 *
 * Exposes:
 *   - Node.js process defaults (heap, GC, event loop lag, CPU, file handles)
 *   - HTTP request count, latency histogram, and error rate
 *   - BullMQ queue depths (waiting / active / completed / failed / delayed) per queue
 *   - Database size and connection health gauge
 *   - Cache (Valkey) and search (Meilisearch) availability gauges
 *
 * Scrape this endpoint from the Prometheus config:
 *   scrape_configs:
 *     - job_name: wivwav_api
 *       static_configs:
 *         - targets: ['api:3001']
 *       metrics_path: /metrics
 *
 * Known limitations:
 *   - The endpoint is unauthenticated and served on the same port as the public API (3001).
 *     It is intended for local development only. Do not expose port 3001 publicly in production
 *     without adding auth (e.g., an IP allowlist or a reverse-proxy auth layer).
 *   - Only the API process is scraped. Scraper and web metrics are available via logs/Loki.
 *   - Queue depth is a point-in-time snapshot polled on each Prometheus scrape (every 15 s).
 */
export const metricsRoutes: FastifyPluginAsync<MetricsPluginOptions> = async (
  app,
  { db, cache, meili, queueFactory, registry },
) => {
  // ── Queue depth gauges ──────────────────────────────────────────────────────

  const queueDepth = new Gauge({
    name: 'wivwav_queue_depth',
    help: 'Current number of jobs in each BullMQ queue by status',
    labelNames: ['queue', 'status'] as const,
    registers: [registry],
    async collect() {
      await Promise.allSettled(
        Object.values(QUEUES).map(async (name) => {
          try {
            const q = queueFactory.createQueue(name)
            const stats = await q.getStats()
            for (const [status, count] of Object.entries(stats)) {
              queueDepth.labels(name, status).set(typeof count === 'number' ? count : 0)
            }
          } catch {
            // Valkey may be unavailable during startup — skip silently
          }
        }),
      )
    },
  })

  // ── Database diagnostics ────────────────────────────────────────────────────

  const dbUp = new Gauge({
    name: 'wivwav_db_up',
    help: '1 if the PostgreSQL connection is reachable, 0 otherwise',
    registers: [registry],
  })

  const dbSizeBytes = new Gauge({
    name: 'wivwav_db_size_bytes',
    help: 'Total on-disk size of the WivWav database in bytes (read-only pg_database query)',
    registers: [registry],
  })

  const dbListingCount = new Gauge({
    name: 'wivwav_db_listing_count',
    help: 'Total number of rows in the listings table',
    registers: [registry],
  })

  // ── Cache (Valkey) diagnostics ──────────────────────────────────────────────

  const valkeyUp = new Gauge({
    name: 'wivwav_valkey_up',
    help: '1 if Valkey (Redis-compatible cache) responds to PING, 0 otherwise',
    registers: [registry],
  })

  // ── Search (Meilisearch) diagnostics ───────────────────────────────────────

  const meilisearchUp = new Gauge({
    name: 'wivwav_meilisearch_up',
    help: '1 if Meilisearch health endpoint reports status=available, 0 otherwise',
    registers: [registry],
  })

  // ── Scrape endpoint ─────────────────────────────────────────────────────────

  app.get('/', { logLevel: 'silent', config: { rateLimit: false } }, async (_req, reply) => {
    // Refresh scalar gauges on each scrape — these are cheap read-only probes
    await Promise.allSettled([
      // DB health + size
      (async () => {
        try {
          type SizeRow = { size: bigint | string }
          const [, sizeRows, count] = await Promise.all([
            db.$queryRaw`SELECT 1`,
            db.$queryRaw<SizeRow[]>`
              SELECT pg_database_size(current_database()) AS size
            `,
            db.listing.count(),
          ])
          dbUp.set(1)
          const sizeRow = sizeRows[0]
          if (sizeRow) {
            dbSizeBytes.set(Number(sizeRow.size))
          }
          dbListingCount.set(count)
        } catch {
          dbUp.set(0)
          dbSizeBytes.set(0)
          dbListingCount.set(0)
        }
      })(),

      // Valkey
      (async () => {
        try {
          if (cache.status === 'wait') await cache.connect()
          await cache.ping()
          valkeyUp.set(1)
        } catch {
          valkeyUp.set(0)
        }
      })(),

      // Meilisearch
      (async () => {
        try {
          const health = await meili.health()
          meilisearchUp.set(health.status === 'available' ? 1 : 0)
        } catch {
          meilisearchUp.set(0)
        }
      })(),
    ])

    // queue depth is handled by the Gauge's own collect() method
    const metrics = await registry.metrics()

    return reply
      .header('Content-Type', registry.contentType)
      .send(metrics)
  })
}
