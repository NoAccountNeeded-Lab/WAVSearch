import type { FastifyPluginAsync } from 'fastify'
import type { Redis } from 'ioredis'
import type { MeiliSearch } from 'meilisearch'
import type { PrismaClient } from '@wav-search/db'
import type { HealthResponse, OverallHealthStatus, ServiceHealth } from '@wav-search/types'
import type { Config } from '../config.js'

const LATENCY_THRESHOLDS_MS = {
  postgres: 100,
  meilisearch: 150,
  valkey: 100,
  ollama: 750,
} as const

const SCRAPER_STALE_MS = 24 * 60 * 60 * 1000
const PROBE_TIMEOUT_MS = 1500

interface HealthPluginOptions {
  db: PrismaClient
  meili: MeiliSearch
  cache: Redis
  config: Config
}

type ProbeName = keyof typeof LATENCY_THRESHOLDS_MS

export const healthRoutes: FastifyPluginAsync<HealthPluginOptions> = async (app, { db, meili, cache, config }) => {
  app.get('/', async (): Promise<HealthResponse> => {
    const [postgres, meilisearch, valkey, ollama, scraper] = await Promise.all([
      probe('postgres', () => db.$queryRaw`SELECT 1`),
      probe('meilisearch', () => meili.health()),
      probe('valkey', async () => {
        if (cache.status === 'wait') {
          await cache.connect()
        }
        await cache.ping()
      }),
      probeOllama(config),
      getScraperHealth(db),
    ])

    const services = { postgres, meilisearch, valkey, ollama, scraper }

    return {
      status: getOverallStatus(Object.values(services)),
      timestamp: new Date().toISOString(),
      services,
    }
  })
}

async function probeOllama(config: Config): Promise<ServiceHealth> {
  const health = await probe('ollama', async () => {
    const response = await fetch(`${config.OLLAMA_BASE_URL}/`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`)
  })

  if (health.status !== 'down') return health
  if (config.OLLAMA_REQUIRED) return { ...health, message: 'Required local AI service is unreachable' }

  return {
    status: 'optional_offline',
    message: 'Optional AI remapping is offline; scraping continues without AI assistance',
  }
}

async function probe(name: ProbeName, fn: () => Promise<unknown>): Promise<ServiceHealth> {
  const started = performance.now()

  try {
    await withTimeout(fn(), PROBE_TIMEOUT_MS)
    const latencyMs = Math.round(performance.now() - started)
    return {
      status: latencyMs > LATENCY_THRESHOLDS_MS[name] ? 'degraded' : 'up',
      latencyMs,
    }
  } catch {
    return { status: 'down' }
  }
}

async function getScraperHealth(db: PrismaClient): Promise<ServiceHealth> {
  try {
    const [sourceCount, activeSourceCount, lastRun] = await withTimeout(
      Promise.all([
        db.source.count(),
        db.source.count({ where: { status: 'active' } }),
        db.scraperRun.findFirst({
          where: { success: true, finishedAt: { not: null } },
          orderBy: { finishedAt: 'desc' },
          select: { finishedAt: true },
        }),
      ]),
      PROBE_TIMEOUT_MS
    )

    if (sourceCount === 0) return { status: 'degraded' }
    if (activeSourceCount === 0) return { status: 'down' }
    if (!lastRun || !lastRun.finishedAt) return { status: 'up' }

    const finishedAt = lastRun.finishedAt
    const lastRunAt = finishedAt.toISOString()
    const ageMs = Date.now() - finishedAt.getTime()
    return {
      status: ageMs > SCRAPER_STALE_MS ? 'degraded' : 'up',
      lastRunAt,
    }
  } catch {
    return { status: 'down' }
  }
}

function getOverallStatus(services: ServiceHealth[]): OverallHealthStatus {
  if (services.some(service => service.status === 'down')) return 'down'
  if (services.some(service => service.status === 'degraded')) return 'degraded'
  return 'ok'
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Health probe timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
