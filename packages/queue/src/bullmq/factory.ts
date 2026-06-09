import { Queue, Worker } from 'bullmq'
import type {
  QueueFactory,
  QueueAdapter,
  WorkerAdapter,
  JobProcessor,
  WorkerOptions,
} from '../types.js'
import { BullMQQueueAdapter } from './queue-adapter.js'
import { BullMQWorkerAdapter } from './worker-adapter.js'
import { connectionFromEnv, type RedisConnectionOptions } from './connection.js'

export class BullMQQueueFactory implements QueueFactory {
  private readonly connection: RedisConnectionOptions
  private readonly queues = new Map<string, Queue>()
  private readonly workers: Worker[] = []

  constructor(connection?: RedisConnectionOptions) {
    this.connection = connection ?? connectionFromEnv()
  }

  createQueue(name: string): QueueAdapter {
    let queue = this.queues.get(name)
    if (!queue) {
      queue = new Queue(name, { connection: this.connection })
      this.queues.set(name, queue)
    }
    return new BullMQQueueAdapter(queue)
  }

  createWorker<T = unknown>(
    name: string,
    processor: JobProcessor<T>,
    options?: WorkerOptions,
  ): WorkerAdapter {
    const worker = new Worker<T>(
      name,
      async (job) => {
        const sourceId = getStringField(job.data, 'sourceId')
        const logBindings = {
          queue: name,
          ...(job.id !== undefined ? { jobId: job.id } : {}),
          ...(sourceId !== undefined ? { sourceId } : {}),
        }
        const logger = options?.logger?.child(logBindings)

        logger?.info('job started')
        const start = Date.now()
        try {
          await processor(job.data, {
            ...(logger !== undefined ? { logger } : {}),
            log: async (message) => {
              await job.log(message)
            },
            updateProgress: (progress) => job.updateProgress(progress),
          })
          logger?.info({ durationMs: Date.now() - start }, 'job completed')
        } catch (err) {
          logger?.error({ err, durationMs: Date.now() - start }, 'job failed')
          throw err
        }
      },
      {
        connection: this.connection,
        ...(options?.lockDuration !== undefined && { lockDuration: options.lockDuration }),
      },
    )

    if (options?.logger) {
      const workerLogger = options.logger.child({ queue: name })
      // prev (the prior job state) is intentionally ignored — jobId is enough for triage
      worker.on('stalled', (jobId: string, _prev: string) => {
        workerLogger.warn({ jobId }, 'job stalled')
      })
      worker.on('error', (err: Error) => {
        workerLogger.error({ err }, 'worker error')
      })
    }

    this.workers.push(worker as unknown as Worker)
    return new BullMQWorkerAdapter(worker as unknown as Worker)
  }

  /**
   * Returns the underlying BullMQ Queue instances.
   * Only use this in the admin layer for Bull Board registration — nowhere else.
   */
  getBullMQQueues(): Queue[] {
    return [...this.queues.values()]
  }

  async close(): Promise<void> {
    await Promise.all([
      ...this.workers.map((w) => w.close()),
      ...[...this.queues.values()].map((q) => q.close()),
    ])
  }
}

function getStringField(data: unknown, key: string): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}
