import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminLogsRoutes } from './admin-logs.js'

const LOKI_URL = 'http://loki.test'

function buildTestApp() {
  const app = Fastify()
  void app.register(adminLogsRoutes, { lokiUrl: LOKI_URL })
  return app
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** Minimal valid Loki query_range response with one stream/line */
function lokiResponse(
  streamLabels: Record<string, string>,
  values: [string, string][],
) {
  return Response.json({
    status: 'success',
    data: {
      resultType: 'streams',
      result: [{ stream: streamLabels, values }],
    },
  })
}

describe('GET /', () => {
  it('returns parsed log entries from Loki', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({ level: 30, msg: 'request completed', service: 'api', pid: 1 })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({ service: 'api' }, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json() as { data: { entries: unknown[]; services: string[] } }
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0]).toMatchObject({
      level: 'info',
      message: 'request completed',
      service: 'api',
    })
    expect(data.services).toContain('api')
  })

  it('maps pino numeric levels to names correctly', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)

    const cases: Array<[number, string]> = [
      [10, 'trace'],
      [20, 'debug'],
      [30, 'info'],
      [40, 'warn'],
      [50, 'error'],
      [60, 'fatal'],
    ]

    for (const [num, name] of cases) {
      const line = JSON.stringify({ level: num, msg: 'test' })
      vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

      const app = buildTestApp()
      const res = await app.inject({ method: 'GET', url: '/' })

      expect(res.statusCode).toBe(200)
      const { data } = res.json() as { data: { entries: Array<{ level: string }> } }
      expect(data.entries.at(0)?.level, `level ${num} should map to ${name}`).toBe(name)
    }
  })

  it('falls back gracefully when log line is not valid JSON', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = 'plain text log line — not JSON'

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({ service: 'scraper' }, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json() as { data: { entries: Array<{ message: string; service: string }> } }
    expect(data.entries.at(0)?.message).toBe(line)
    expect(data.entries.at(0)?.service).toBe('scraper')
  })

  it('extracts requestId, queue, jobId, sourceId from parsed JSON', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({
      level: 30,
      msg: 'job done',
      requestId: 'req-abc',
      queue: 'geocode',
      jobId: 'job-123',
      sourceId: 'src-xyz',
    })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json() as {
      data: {
        entries: Array<{
          requestId: string
          queue: string
          jobId: string
          sourceId: string
        }>
      }
    }
    expect(data.entries[0]).toMatchObject({
      requestId: 'req-abc',
      queue: 'geocode',
      jobId: 'job-123',
      sourceId: 'src-xyz',
    })
  })

  it('strips noise fields (time, pid, hostname, v) from extra', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({
      level: 30,
      msg: 'test',
      time: 1234567890,
      pid: 42,
      hostname: 'box',
      v: 1,
      customField: 'keep-me',
    })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as { data: { entries: Array<{ extra: Record<string, unknown> }> } }
    const extra = data.entries.at(0)?.extra ?? {}
    expect(extra).not.toHaveProperty('time')
    expect(extra).not.toHaveProperty('pid')
    expect(extra).not.toHaveProperty('hostname')
    expect(extra).not.toHaveProperty('v')
    expect(extra).toHaveProperty('customField', 'keep-me')
  })

  it('applies service filter in LogQL selector', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return Response.json({ status: 'success', data: { resultType: 'streams', result: [] } })
    }))

    const app = buildTestApp()
    await app.inject({ method: 'GET', url: '/?service=api' })

    expect(capturedUrl).toContain('service%3D%22api%22')
  })

  it('applies text search filter in LogQL', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return Response.json({ status: 'success', data: { resultType: 'streams', result: [] } })
    }))

    const app = buildTestApp()
    await app.inject({ method: 'GET', url: '/?search=error+connecting' })

    // Backtick filter: |= `error connecting`
    const query = new URL(capturedUrl).searchParams.get('query') ?? ''
    expect(query).toContain('|= `error connecting`')
  })

  it('returns 503 when Loki is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(503)
    const body = res.json() as { error: { code: string } }
    expect(body.error.code).toBe('LOG_BACKEND_UNAVAILABLE')
  })

  it('returns 502 when Loki responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad query', { status: 400 })))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(502)
    const body = res.json() as { error: { code: string; message: string } }
    expect(body.error.code).toBe('LOG_BACKEND_ERROR')
    expect(body.error.message).toContain('400')
  })

  it('caps limit at 500', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return Response.json({ status: 'success', data: { resultType: 'streams', result: [] } })
    }))

    const app = buildTestApp()
    await app.inject({ method: 'GET', url: '/?limit=9999' })

    expect(capturedUrl).toContain('limit=500')
  })

  it('returns empty entries and services when Loki returns no streams', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({ status: 'success', data: { resultType: 'streams', result: [] } })
    ))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json() as { data: { entries: unknown[]; services: string[] } }
    expect(data.entries).toHaveLength(0)
    expect(data.services).toHaveLength(0)
  })

  it('falls back to message field when msg is absent', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({ level: 30, message: 'alt message field' })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as { data: { entries: Array<{ message: string }> } }
    expect(data.entries.at(0)?.message).toBe('alt message field')
  })

  it('uses snake_case aliases for requestId, jobId, sourceId', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({
      level: 30,
      msg: 'alias test',
      req_id: 'req-snake',
      job_id: 'job-snake',
      source_id: 'src-snake',
    })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as {
      data: { entries: Array<{ requestId: string; jobId: string; sourceId: string }> }
    }
    expect(data.entries[0]).toMatchObject({
      requestId: 'req-snake',
      jobId: 'job-snake',
      sourceId: 'src-snake',
    })
  })

  it('falls back to streamLabels.app when service field is absent', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({ level: 30, msg: 'from app label' })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({ app: 'my-app' }, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as { data: { entries: Array<{ service: string }> } }
    expect(data.entries.at(0)?.service).toBe('my-app')
  })

  it('accepts a string-typed level field', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({ level: 'warn', msg: 'string level' })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as { data: { entries: Array<{ level: string }> } }
    expect(data.entries.at(0)?.level).toBe('warn')
  })

  it('extracts stack field', async () => {
    const tsNs = String(BigInt(Date.now()) * 1_000_000n)
    const line = JSON.stringify({
      level: 50,
      msg: 'uncaught error',
      stack: 'Error: boom\n  at Object.<anonymous> (index.js:1:1)',
    })

    vi.stubGlobal('fetch', vi.fn(async () => lokiResponse({}, [[tsNs, line]])))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as { data: { entries: Array<{ stack: string }> } }
    expect(data.entries.at(0)?.stack).toContain('Error: boom')
  })

  it('uses the default limit of 200 when no limit param is given', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return Response.json({ status: 'success', data: { resultType: 'streams', result: [] } })
    }))

    const app = buildTestApp()
    await app.inject({ method: 'GET', url: '/' })

    expect(capturedUrl).toContain('limit=200')
  })

  it('uses backtick filter to safely embed double-quotes in search', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = url
      return Response.json({ status: 'success', data: { resultType: 'streams', result: [] } })
    }))

    const app = buildTestApp()
    // search value: say "hello"
    await app.inject({ method: 'GET', url: '/?search=say+"hello"' })

    // Backtick filter passes double-quotes through literally — no escape needed
    const query = new URL(capturedUrl).searchParams.get('query') ?? ''
    expect(query).toContain('|= `say "hello"`')
  })

  it('merges entries from multiple streams', async () => {
    const tsNs1 = String(BigInt(Date.now() - 1000) * 1_000_000n)
    const tsNs2 = String(BigInt(Date.now()) * 1_000_000n)
    const line1 = JSON.stringify({ level: 30, msg: 'from api', service: 'api' })
    const line2 = JSON.stringify({ level: 40, msg: 'from scraper', service: 'scraper' })

    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({
        status: 'success',
        data: {
          resultType: 'streams',
          result: [
            { stream: { service: 'api' }, values: [[tsNs1, line1]] },
            { stream: { service: 'scraper' }, values: [[tsNs2, line2]] },
          ],
        },
      })
    ))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    const { data } = res.json() as { data: { entries: unknown[]; services: string[] } }
    expect(data.entries).toHaveLength(2)
    expect(data.services).toContain('api')
    expect(data.services).toContain('scraper')
  })

  it('sorts entries newest-first when Loki returns them out of order', async () => {
    const olderNs = String(BigInt(Date.now() - 5000) * 1_000_000n)
    const newerNs = String(BigInt(Date.now()) * 1_000_000n)
    const oldLine = JSON.stringify({ level: 30, msg: 'older' })
    const newLine = JSON.stringify({ level: 30, msg: 'newer' })

    vi.stubGlobal('fetch', vi.fn(async () =>
      lokiResponse({}, [[olderNs, oldLine], [newerNs, newLine]])
    ))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/' })

    const { data } = res.json() as { data: { entries: Array<{ message: string }> } }
    expect(data.entries[0]?.message).toBe('newer')
    expect(data.entries[1]?.message).toBe('older')
  })
})

describe('GET /services', () => {
  it('returns service label values from Loki', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({ data: ['api', 'scraper', 'worker'] })
    ))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/services' })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: string[] }
    expect(body.data).toEqual(['api', 'scraper', 'worker'])
  })

  it('returns 503 when Loki is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/services' })

    expect(res.statusCode).toBe(503)
    const body = res.json() as { error: { code: string } }
    expect(body.error.code).toBe('LOG_BACKEND_UNAVAILABLE')
  })

  it('returns 502 when Loki responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/services' })

    expect(res.statusCode).toBe(502)
    const body = res.json() as { error: { code: string } }
    expect(body.error.code).toBe('LOG_BACKEND_ERROR')
  })

  it('returns empty array when Loki data field is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})))

    const app = buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/services' })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { data: string[] }
    expect(body.data).toEqual([])
  })
})
