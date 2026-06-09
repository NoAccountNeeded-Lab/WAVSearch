import { describe, expect, it, vi } from 'vitest'
import type { LogMethod, WivWavLogger } from './logger.js'
import { withTimer } from './timer.js'

function makeLogger() {
  const calls: { level: string; args: unknown[] }[] = []
  const m = (level: string): LogMethod =>
    ((...args: unknown[]) => void calls.push({ level, args })) as unknown as LogMethod
  const logger: WivWavLogger = {
    debug: m('debug'),
    info: m('info'),
    warn: m('warn'),
    error: m('error'),
    level: 'info',
    child: () => logger,
  }
  return { logger, calls }
}

describe('withTimer', () => {
  it('returns the resolved value of the wrapped function', async () => {
    const { logger } = makeLogger()
    const result = await withTimer(logger, 'op', {}, async () => 42)
    expect(result).toBe(42)
  })

  it('logs info with durationMs on success', async () => {
    const { logger, calls } = makeLogger()
    await withTimer(logger, 'geocode', { listingId: 'abc' }, async () => 'ok')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.level).toBe('info')
    const [fields, msg] = calls[0]!.args as [Record<string, unknown>, string]
    expect(msg).toBe('geocode completed')
    expect(typeof fields.durationMs).toBe('number')
    expect(fields.listingId).toBe('abc')
  })

  it('logs error with durationMs on failure and re-throws', async () => {
    const { logger, calls } = makeLogger()
    const boom = new Error('something went wrong')

    await expect(
      withTimer(logger, 'extraction', { jobId: 'j1' }, async () => {
        throw boom
      }),
    ).rejects.toThrow('something went wrong')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.level).toBe('error')
    const [fields, msg] = calls[0]!.args as [Record<string, unknown>, string]
    expect(msg).toBe('extraction failed')
    expect(typeof fields.durationMs).toBe('number')
    expect(fields.err).toBe(boom)
    expect(fields.jobId).toBe('j1')
  })

  it('merges extra fields into every log line', async () => {
    const { logger, calls } = makeLogger()
    await withTimer(logger, 'scrape', { queue: 'source-scrape', sourceId: 's1' }, async () => {})

    const [fields] = calls[0]!.args as [Record<string, unknown>]
    expect(fields.queue).toBe('source-scrape')
    expect(fields.sourceId).toBe('s1')
  })

  it('uses real elapsed time', async () => {
    const { logger, calls } = makeLogger()
    vi.useFakeTimers()
    const p = withTimer(logger, 'slow-op', {}, async () => {
      vi.advanceTimersByTime(150)
    })
    await p
    vi.useRealTimers()

    const [fields] = calls[0]!.args as [Record<string, unknown>]
    expect(fields.durationMs).toBeGreaterThanOrEqual(150)
  })
})
