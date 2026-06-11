/**
 * Unit tests for BullMQQueueFactory job lifecycle logging.
 *
 * BullMQ Worker and Queue require a live Redis connection, so we mock the
 * `bullmq` module and drive the internal processor function directly.
 */
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoggerContext, WivWavLogger } from '@wivwav/logger'

// ---------------------------------------------------------------------------
// Minimal BullMQ stubs
// ---------------------------------------------------------------------------

/** A fake BullMQ Job passed into the processor function. */
function makeFakeJob(data: unknown, id = 'job-1') {
  return {
    id,
    data,
    log: vi.fn(async (_msg: string) => {}),
    updateProgress: vi.fn(async (_p: unknown) => {}),
  }
}

/**
 * Capture the processor function registered with Worker so tests can invoke
 * it directly without a running Redis.
 */
let capturedProcessor: ((job: unknown) => Promise<void>) | undefined
let capturedWorkerInstance: FakeWorker | undefined

class FakeWorker extends EventEmitter {
  constructor(_name: string, processor: (job: unknown) => Promise<void>) {
    super()
    capturedProcessor = processor
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedWorkerInstance = this
  }
  async close() {}
}

class FakeQueue extends EventEmitter {
  async close() {}
}

vi.mock('bullmq', () => ({
  Worker: FakeWorker,
  Queue: FakeQueue,
}))

// ---------------------------------------------------------------------------
// Import factory AFTER the mock is in place
// ---------------------------------------------------------------------------
const { BullMQQueueFactory } = await import('./factory.js')

const TEST_CONNECTION = { host: 'localhost', port: 6379, maxRetriesPerRequest: null } as const

// ---------------------------------------------------------------------------
// Logger spy helper
// ---------------------------------------------------------------------------
function makeLogger() {
  const calls: { level: string; args: unknown[] }[] = []
  const method =
    (level: string) =>
    (...args: unknown[]) =>
      void calls.push({ level, args })

  const logger: WivWavLogger = {
    debug: method('debug') as WivWavLogger['debug'],
    info: method('info') as WivWavLogger['info'],
    warn: method('warn') as WivWavLogger['warn'],
    error: method('error') as WivWavLogger['error'],
    level: 'info',
    child: () => logger,
  }
  return { logger, calls }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('BullMQQueueFactory – job lifecycle logging', () => {
  beforeEach(() => {
    capturedProcessor = undefined
    capturedWorkerInstance = undefined
  })

  it('logs "job started" at info level when a job begins processing', async () => {
    const { logger, calls } = makeLogger()
    const factory = new BullMQQueueFactory(TEST_CONNECTION)

    const processor = vi.fn(async () => {})
    factory.createWorker('test-queue', processor, { logger })

    const job = makeFakeJob({ sourceId: 'src-1' })
    await capturedProcessor!(job)

    const startedCall = calls.find(
      (c) => c.level === 'info' && (c.args[0] as string) === 'job started',
    )
    expect(startedCall).toBeDefined()

    await factory.close()
  })

  it('logs "job completed" at info level with durationMs on success', async () => {
    const { logger, calls } = makeLogger()
    const factory = new BullMQQueueFactory(TEST_CONNECTION)

    factory.createWorker('test-queue', async () => {}, { logger })

    const job = makeFakeJob({})
    await capturedProcessor!(job)

    const completedCall = calls.find(
      (c) => c.level === 'info' && (c.args[1] as string) === 'job completed',
    )
    expect(completedCall).toBeDefined()
    const fields = completedCall!.args[0] as Record<string, unknown>
    expect(typeof fields['durationMs']).toBe('number')

    await factory.close()
  })

  it('logs "job failed" at error level with err and durationMs on failure, then re-throws', async () => {
    const { logger, calls } = makeLogger()
    const factory = new BullMQQueueFactory(TEST_CONNECTION)

    const boom = new Error('processor error')
    factory.createWorker(
      'test-queue',
      async () => {
        throw boom
      },
      { logger },
    )

    const job = makeFakeJob({})
    await expect(capturedProcessor!(job)).rejects.toThrow('processor error')

    const failedCall = calls.find(
      (c) => c.level === 'error' && (c.args[1] as string) === 'job failed',
    )
    expect(failedCall).toBeDefined()
    const fields = failedCall!.args[0] as Record<string, unknown>
    expect(fields['err']).toBe(boom)
    expect(typeof fields['durationMs']).toBe('number')

    await factory.close()
  })

  it('delegates all processor log calls to a child of the provided logger', async () => {
    const childCalls: { level: string; args: unknown[] }[] = []
    const childLogger: WivWavLogger = {
      debug: (...args: unknown[]) => void childCalls.push({ level: 'debug', args }),
      info: (...args: unknown[]) => void childCalls.push({ level: 'info', args }),
      warn: (...args: unknown[]) => void childCalls.push({ level: 'warn', args }),
      error: (...args: unknown[]) => void childCalls.push({ level: 'error', args }),
      level: 'info',
      child: () => childLogger,
    }
    const rootLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: () => childLogger,
    }

    const factory = new BullMQQueueFactory(TEST_CONNECTION)
    factory.createWorker('my-queue', async () => {}, { logger: rootLogger })

    const job = makeFakeJob({ sourceId: 'src-42' }, 'job-99')
    await capturedProcessor!(job)

    // The child logger (not rootLogger) should have received the lifecycle logs
    expect(childCalls.some((c) => c.level === 'info')).toBe(true)

    await factory.close()
  })

  it('includes traceId in child logger bindings when present in job data', async () => {
    const childBindings: LoggerContext[] = []
    const childLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: () => childLogger,
    }
    const rootLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: (bindings: LoggerContext) => {
        childBindings.push(bindings)
        return childLogger
      },
    }

    const factory = new BullMQQueueFactory(TEST_CONNECTION)
    factory.createWorker('trace-queue', async () => {}, { logger: rootLogger })

    const job = makeFakeJob({ sourceId: 'src-1', traceId: 'req-abc-123' }, 'job-42')
    await capturedProcessor!(job)

    const processorBindings = childBindings.find(b => 'jobId' in b)!
    expect(processorBindings['traceId']).toBe('req-abc-123')
    expect(processorBindings['sourceId']).toBe('src-1')
    expect(processorBindings['jobId']).toBe('job-42')
    expect(processorBindings['queue']).toBe('trace-queue')

    await factory.close()
  })

  it('omits traceId from child logger bindings when absent from job data', async () => {
    const childBindings: LoggerContext[] = []
    const childLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: () => childLogger,
    }
    const rootLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: (bindings: LoggerContext) => {
        childBindings.push(bindings)
        return childLogger
      },
    }

    const factory = new BullMQQueueFactory(TEST_CONNECTION)
    factory.createWorker('no-trace-queue', async () => {}, { logger: rootLogger })

    const job = makeFakeJob({ sourceId: 'src-2' }, 'job-43')
    await capturedProcessor!(job)

    const processorBindings = childBindings.find(b => 'jobId' in b)!
    expect(processorBindings['traceId']).toBeUndefined()
    expect(processorBindings['sourceId']).toBe('src-2')

    await factory.close()
  })

  it('omits traceId from child logger bindings when traceId is a non-string value', async () => {
    const childBindings: LoggerContext[] = []
    const childLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: () => childLogger,
    }
    const rootLogger: WivWavLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      level: 'info',
      child: (bindings: LoggerContext) => {
        childBindings.push(bindings)
        return childLogger
      },
    }

    const factory = new BullMQQueueFactory(TEST_CONNECTION)
    factory.createWorker('bad-trace-queue', async () => {}, { logger: rootLogger })

    // traceId is a number — getStringField must return undefined and omit it
    const job = makeFakeJob({ sourceId: 'src-3', traceId: 42 }, 'job-44')
    await capturedProcessor!(job)

    const processorBindings = childBindings.find(b => 'jobId' in b)!
    expect(processorBindings['traceId']).toBeUndefined()
    expect(processorBindings['sourceId']).toBe('src-3')

    await factory.close()
  })


  it('does not throw when no logger option is provided', async () => {
    const factory = new BullMQQueueFactory(TEST_CONNECTION)

    factory.createWorker('test-queue', async () => {})

    // Should resolve without error even without a logger
    await expect(capturedProcessor!(makeFakeJob({}))).resolves.toBeUndefined()

    await factory.close()
  })

  it('logs "job stalled" at warn level with jobId when the stalled event fires', async () => {
    const { logger, calls } = makeLogger()
    const factory = new BullMQQueueFactory(TEST_CONNECTION)

    factory.createWorker('test-queue', async () => {}, { logger })

    const worker = capturedWorkerInstance!
    worker.emit('stalled', 'job-stalled-42')

    const stalledCall = calls.find(
      (c) => c.level === 'warn' && (c.args[1] as string) === 'job stalled',
    )
    expect(stalledCall).toBeDefined()
    const fields = stalledCall!.args[0] as Record<string, unknown>
    expect(fields['jobId']).toBe('job-stalled-42')

    await factory.close()
  })

  it('logs "worker error" at error level with err when the error event fires', async () => {
    const { logger, calls } = makeLogger()
    const factory = new BullMQQueueFactory(TEST_CONNECTION)

    factory.createWorker('test-queue', async () => {}, { logger })

    const worker = capturedWorkerInstance!
    const workerErr = new Error('redis connection lost')
    worker.emit('error', workerErr)

    const errorCall = calls.find(
      (c) => c.level === 'error' && (c.args[1] as string) === 'worker error',
    )
    expect(errorCall).toBeDefined()
    const fields = errorCall!.args[0] as Record<string, unknown>
    expect(fields['err']).toBe(workerErr)

    await factory.close()
  })
})
