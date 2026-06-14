import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobContext } from '@wivwav/queue'

// ── Sentry mock ──────────────────────────────────────────────────────────────
const mockCaptureException = vi.fn()
const mockSetTag = vi.fn()
const mockWithScope = vi.fn((cb: (scope: { setTag: typeof mockSetTag }) => void) => {
  cb({ setTag: mockSetTag })
})

vi.mock('@sentry/node', () => ({
  withScope: mockWithScope,
  captureException: mockCaptureException,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(): JobContext {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('withSentryCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('calls the underlying processor and resolves when it succeeds', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const processor = vi.fn().mockResolvedValue(undefined)
    const wrapped = withSentryCapture('test-queue', processor)
    const ctx = makeContext()

    await wrapped({ foo: 'bar' }, ctx)

    expect(processor).toHaveBeenCalledOnce()
    expect(processor).toHaveBeenCalledWith({ foo: 'bar' }, ctx)
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('captures the error in Sentry and rethrows when the processor throws', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const error = new Error('processor failed')
    const processor = vi.fn().mockRejectedValue(error)
    const wrapped = withSentryCapture('scrape-queue', processor)

    await expect(wrapped({}, makeContext())).rejects.toThrow('processor failed')

    expect(mockWithScope).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it('sets the queue tag on the Sentry scope', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const error = new Error('oops')
    const processor = vi.fn().mockRejectedValue(error)
    const wrapped = withSentryCapture('my-queue', processor)

    await expect(wrapped({}, makeContext())).rejects.toThrow()

    expect(mockSetTag).toHaveBeenCalledWith('queue', 'my-queue')
  })

  it('sets the sourceId tag when data has a string sourceId', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const error = new Error('fail')
    const processor = vi.fn().mockRejectedValue(error)
    const wrapped = withSentryCapture('q', processor)

    await expect(wrapped({ sourceId: 'dealer-abc' }, makeContext())).rejects.toThrow()

    expect(mockSetTag).toHaveBeenCalledWith('sourceId', 'dealer-abc')
  })

  it('does not set sourceId tag when data has a non-string sourceId', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const error = new Error('fail')
    const processor = vi.fn().mockRejectedValue(error)
    const wrapped = withSentryCapture('q', processor)

    await expect(wrapped({ sourceId: 42 }, makeContext())).rejects.toThrow()

    // queue tag is set, but sourceId tag should not be
    expect(mockSetTag).toHaveBeenCalledWith('queue', 'q')
    expect(mockSetTag).not.toHaveBeenCalledWith('sourceId', expect.anything())
  })

  it('does not set sourceId tag when data is not an object', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const error = new Error('fail')
    const processor = vi.fn<() => Promise<void>>().mockRejectedValue(error)
    const wrapped = withSentryCapture<string>('q', processor)

    await expect(wrapped('plain-string', makeContext())).rejects.toThrow()

    expect(mockSetTag).not.toHaveBeenCalledWith('sourceId', expect.anything())
  })

  it('rethrows the original error so BullMQ can mark the job failed', async () => {
    const { withSentryCapture } = await import('./capture-job-error.js')
    const original = new TypeError('type mismatch')
    const processor = vi.fn().mockRejectedValue(original)
    const wrapped = withSentryCapture('q', processor)

    const rejected = await wrapped({}, makeContext()).catch((e: unknown) => e)
    expect(rejected).toBe(original)
  })
})
