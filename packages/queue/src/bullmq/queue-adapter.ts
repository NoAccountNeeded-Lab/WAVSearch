import type { Queue, JobsOptions } from 'bullmq'
import type { QueueAdapter, JobOptions, JobRecord, JobStats, JobStatus } from '../types.js'

export class BullMQQueueAdapter implements QueueAdapter {
  readonly name: string

  constructor(private readonly queue: Queue) {
    this.name = queue.name
  }

  async add(data: unknown, options?: JobOptions): Promise<string> {
    const opts: JobsOptions = {}
    if (options?.delay !== undefined) opts.delay = options.delay
    if (options?.attempts !== undefined) opts.attempts = options.attempts
    if (options?.backoff !== undefined) opts.backoff = options.backoff

    const job = await this.queue.add(this.name, data as object, opts)
    return job.id ?? ''
  }

  async pause(): Promise<void> {
    await this.queue.pause()
  }

  async resume(): Promise<void> {
    await this.queue.resume()
  }

  async isPaused(): Promise<boolean> {
    return this.queue.isPaused()
  }

  async getStats(): Promise<JobStats> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    )
    return {
      waiting: counts['waiting'] ?? 0,
      active: counts['active'] ?? 0,
      completed: counts['completed'] ?? 0,
      failed: counts['failed'] ?? 0,
      delayed: counts['delayed'] ?? 0,
    }
  }

  async getJobs(statuses: JobStatus[]): Promise<JobRecord[]> {
    const jobs = await this.queue.getJobs(statuses)
    return Promise.all(
      jobs.map(async (job): Promise<JobRecord> => ({
        id: job.id ?? '',
        name: job.name,
        data: job.data,
        status: (await job.getState()) as JobStatus,
        createdAt: new Date(job.timestamp),
        ...(job.finishedOn !== undefined && { finishedAt: new Date(job.finishedOn) }),
        ...(job.failedReason !== undefined && { failedReason: job.failedReason }),
        attemptsMade: job.attemptsMade,
      })),
    )
  }

  async close(): Promise<void> {
    await this.queue.close()
  }

  /** Exposes the underlying BullMQ Queue — for Bull Board wiring in the admin layer only. */
  getBullMQQueue(): Queue {
    return this.queue
  }
}
