import type { FastifyPluginAsync } from 'fastify'

interface AdminLogsPluginOptions {
  lokiUrl: string
}

/** A single log line as returned by Loki's query_range stream values */
interface LokiStream {
  stream: Record<string, string>
  values: [string, string][]
}

interface LokiQueryData {
  resultType: string
  result: LokiStream[]
}

interface LokiQueryResponse {
  status: string
  data: LokiQueryData
}

/** Normalised log entry returned to the UI */
export interface LogEntry {
  ts: string
  level: string | null
  service: string | null
  message: string | null
  requestId: string | null
  queue: string | null
  jobId: string | null
  sourceId: string | null
  stack: string | null
  /** Any remaining structured fields not captured above */
  extra: Record<string, unknown>
}

interface LogsQuerystring {
  service?: string
  search?: string
  limit?: string
  start?: string
  end?: string
}

/**
 * Parse a Loki log line into a structured LogEntry.
 * Lines are pino-formatted JSON; fall back to raw message string if parsing fails.
 */
function parseLine(streamLabels: Record<string, string>, line: string, tsNs: string): LogEntry {
  const ts = new Date(Math.floor(Number(tsNs) / 1_000_000)).toISOString()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return {
      ts,
      level: streamLabels.level ?? null,
      service: streamLabels.service ?? null,
      message: line,
      requestId: null,
      queue: null,
      jobId: null,
      sourceId: null,
      stack: null,
      extra: {},
    }
  }

  const pull = (key: string): string | null => {
    const v = parsed[key]
    if (typeof v === 'string') {
      delete parsed[key]
      return v || null
    }
    return null
  }

  // pino level numbers → names (pino defaults: trace=10 debug=20 info=30 warn=40 error=50 fatal=60)
  const levelNum = parsed.level
  delete parsed.level
  let levelName: string | null = streamLabels.level ?? null
  if (typeof levelNum === 'number') {
    if (levelNum < 20) levelName = 'trace'
    else if (levelNum < 30) levelName = 'debug'
    else if (levelNum < 40) levelName = 'info'
    else if (levelNum < 50) levelName = 'warn'
    else if (levelNum < 60) levelName = 'error'
    else levelName = 'fatal'
  } else if (typeof levelNum === 'string') {
    levelName = levelNum
  }

  // Remove well-known noise fields
  delete parsed.time
  delete parsed.pid
  delete parsed.hostname
  delete parsed.v

  const service = pull('service') ?? streamLabels.service ?? streamLabels.app ?? null
  const message = pull('msg') ?? pull('message') ?? null
  const requestId = pull('requestId') ?? pull('req_id') ?? null
  const queue = pull('queue') ?? null
  const jobId = pull('jobId') ?? pull('job_id') ?? null
  const sourceId = pull('sourceId') ?? pull('source_id') ?? null
  const stack = pull('stack') ?? null

  return {
    ts,
    level: levelName,
    service,
    message,
    requestId,
    queue,
    jobId,
    sourceId,
    stack,
    extra: parsed as Record<string, unknown>,
  }
}

export const adminLogsRoutes: FastifyPluginAsync<AdminLogsPluginOptions> = async (
  app,
  { lokiUrl },
) => {
  /**
   * GET /admin/logs
   *
   * Query Loki for recent log lines. Returns a flat array of normalised LogEntry
   * objects in descending timestamp order.
   *
   * Query params:
   *   service  — filter by service label (e.g. "api", "scraper")
   *   search   — substring to include in LogQL |= filter
   *   limit    — max entries (default 200, max 500)
   *   start    — ISO / ns epoch start time (default: 1 hour ago)
   *   end      — ISO / ns epoch end time (default: now)
   */
  app.get<{ Querystring: LogsQuerystring }>('/', async (req, reply) => {
    const { service, search, limit: limitStr, start: startStr, end: endStr } = req.query

    const limitParsed = parseInt(limitStr ?? '200', 10)
    const limit = Math.min(isNaN(limitParsed) ? 200 : Math.max(1, limitParsed), 500)
    const nowMs = Date.now()
    const startMs = (() => {
      if (!startStr) return nowMs - 3_600_000
      const asNum = Number(startStr)
      if (!isNaN(asNum)) return Math.floor(asNum / 1_000_000)
      const asDate = new Date(startStr).getTime()
      return isNaN(asDate) ? nowMs - 3_600_000 : asDate
    })()
    const endMs = (() => {
      if (!endStr) return nowMs
      const asNum = Number(endStr)
      if (!isNaN(asNum)) return Math.floor(asNum / 1_000_000)
      const asDate = new Date(endStr).getTime()
      return isNaN(asDate) ? nowMs : asDate
    })()

    // Build LogQL selector — use {service=~".+"} as default so all Alloy-shipped streams match
    let selector = '{service=~".+"}'
    if (service) {
      // Escape backslashes and double-quotes before embedding in a label selector string
      const escapedService = service.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      selector = `{service="${escapedService}"}`
    }

    let logql = selector
    if (search) {
      // Use LogQL backtick filter (raw string — no escape sequences) to safely embed arbitrary text.
      // Strip backtick characters since they cannot appear inside a LogQL backtick string.
      const safe = search.replace(/`/g, '')
      logql = selector + ' |= `' + safe + '`'
    }

    const params = new URLSearchParams({
      query: logql,
      limit: String(limit),
      start: String(startMs * 1_000_000),
      end: String(endMs * 1_000_000),
      direction: 'backward',
    })

    let lokiRes: Response
    try {
      lokiRes = await fetch(`${lokiUrl}/loki/api/v1/query_range?${params.toString()}`, {
        signal: AbortSignal.timeout(8_000),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Loki unavailable'
      return reply.code(503).send({ error: { code: 'LOG_BACKEND_UNAVAILABLE', message: msg } })
    }

    if (!lokiRes.ok) {
      const text = await lokiRes.text().catch(() => '')
      return reply
        .code(502)
        .send({ error: { code: 'LOG_BACKEND_ERROR', message: `Loki responded ${lokiRes.status}: ${text}` } })
    }

    const body = (await lokiRes.json()) as LokiQueryResponse

    const entries: LogEntry[] = []
    for (const stream of body.data?.result ?? []) {
      for (const [tsNs, line] of stream.values) {
        entries.push(parseLine(stream.stream, line, tsNs))
      }
    }

    // Sort newest-first (Loki backward direction should already do this, but normalise)
    entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))

    // Collect distinct service labels for the filter dropdown
    const services = [...new Set(entries.map(e => e.service).filter(Boolean))] as string[]

    return reply.send({ data: { entries, services } })
  })

  /**
   * GET /admin/logs/services
   * Return the set of known service labels from Loki label values.
   */
  app.get('/services', async (_req, reply) => {
    let lokiRes: Response
    try {
      lokiRes = await fetch(`${lokiUrl}/loki/api/v1/label/service/values`, {
        signal: AbortSignal.timeout(4_000),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Loki unavailable'
      return reply.code(503).send({ error: { code: 'LOG_BACKEND_UNAVAILABLE', message: msg } })
    }

    if (!lokiRes.ok) {
      return reply.code(502).send({ error: { code: 'LOG_BACKEND_ERROR', message: `Loki responded ${lokiRes.status}` } })
    }

    const body = (await lokiRes.json()) as { data: string[] }
    return reply.send({ data: body.data ?? [] })
  })
}
