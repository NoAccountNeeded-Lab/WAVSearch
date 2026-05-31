import { Queue, Worker } from 'bullmq'
import type { QueueFactory, QueueAdapter, WorkerAdapter, JobProcessor, WorkerOptions } from '../types.js'
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

  createWorker<T = unknown>(name: string, processor: JobProcessor<T>, options?: WorkerOptions): WorkerAdapter {
    const worker = new Worker<T>(
      name,
      async (job) => {
        await processor(job.data, {
          log: async (message) => {
            await job.log(message)
          },
          updateProgress: (progress) => job.updateProgress(progress),
        })
      },
      { connection: this.connection, ...(options?.lockDuration !== undefined && { lockDuration: options.lockDuration }) },
    )
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
