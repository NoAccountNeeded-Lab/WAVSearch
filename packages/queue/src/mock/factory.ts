import type {
  QueueFactory,
  QueueAdapter,
  WorkerAdapter,
  JobProcessor,
  JobOptions,
  JobRecord,
  JobStats,
  JobStatus,
} from '../types.js'

interface StoredJob {
  id: string
  data: unknown
  options: JobOptions | undefined
  status: JobStatus
  createdAt: Date
  failedReason: string | undefined
  attemptsMade: number
  progress: unknown
  logs: string[]
}

export class MockQueueAdapter implements QueueAdapter {
  readonly name: string
  private jobs: StoredJob[] = []
  private paused = false
  private counter = 0

  constructor(name: string) {
    this.name = name
  }

  async add(data: unknown, options?: JobOptions): Promise<string> {
    const id = String(++this.counter)
    this.jobs.push({
      id,
      data,
      options,
      status: 'waiting',
      createdAt: new Date(),
      attemptsMade: 0,
      failedReason: undefined,
      progress: 0,
      logs: [],
    })
    return id
  }

  async pause(): Promise<void> {
    this.paused = true
  }

  async resume(): Promise<void> {
    this.paused = false
  }

  async isPaused(): Promise<boolean> {
    return this.paused
  }

  async getStats(): Promise<JobStats> {
    const count = (s: JobStatus) => this.jobs.filter((j) => j.status === s).length
    return {
      waiting: count('waiting'),
      active: count('active'),
      completed: count('completed'),
      failed: count('failed'),
      delayed: count('delayed'),
    }
  }

  async getJobs(statuses: JobStatus[]): Promise<JobRecord[]> {
    return this.jobs
      .filter((j) => statuses.includes(j.status))
      .map((j): JobRecord => ({
        id: j.id,
        name: this.name,
        data: j.data,
        status: j.status,
        createdAt: j.createdAt,
        attemptsMade: j.attemptsMade,
        progress: j.progress,
        logs: [...j.logs],
        ...(j.failedReason !== undefined && { failedReason: j.failedReason }),
      }))
  }

  async close(): Promise<void> {}

  /** Test helper: all jobs enqueued so far. */
  getEnqueued(): StoredJob[] {
    return [...this.jobs]
  }

  /** Test helper: reset state between tests. */
  clear(): void {
    this.jobs = []
    this.counter = 0
  }
}

class MockWorkerAdapter implements WorkerAdapter {
  async close(): Promise<void> {}
}

export class MockQueueFactory implements QueueFactory {
  private readonly queues = new Map<string, MockQueueAdapter>()

  createQueue(name: string): QueueAdapter {
    let queue = this.queues.get(name)
    if (!queue) {
      queue = new MockQueueAdapter(name)
      this.queues.set(name, queue)
    }
    return queue
  }

  createWorker<T = unknown>(_name: string, _processor: JobProcessor<T>, _options?: import('../types.js').WorkerOptions): WorkerAdapter {
    return new MockWorkerAdapter()
  }

  async close(): Promise<void> {}

  /** Test helper: get the MockQueueAdapter for a named queue. */
  getQueue(name: string): MockQueueAdapter | undefined {
    return this.queues.get(name)
  }
}
