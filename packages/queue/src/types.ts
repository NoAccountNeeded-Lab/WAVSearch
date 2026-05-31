export interface JobOptions {
  delay?: number
  attempts?: number
  backoff?: { type: 'exponential' | 'fixed'; delay: number }
}

export interface JobStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

export interface JobRecord {
  id: string
  name: string
  data: unknown
  status: JobStatus
  createdAt: Date
  finishedAt?: Date
  failedReason?: string
  attemptsMade: number
  progress: unknown
  logs: string[]
}

export type JobProgress = string | number | boolean | object

export interface JobContext {
  log(message: string): Promise<void>
  updateProgress(progress: JobProgress): Promise<void>
}

export type JobProcessor<T = unknown> = (data: T, context: JobContext) => Promise<void>

export interface RepeatableJob {
  key: string
  name: string
  id: string | null
  tz: string | null
  pattern: string | null
  next: number | null
}

export interface QueueAdapter {
  readonly name: string
  add(data: unknown, options?: JobOptions): Promise<string>
  pause(): Promise<void>
  resume(): Promise<void>
  isPaused(): Promise<boolean>
  getStats(): Promise<JobStats>
  getJobs(statuses: JobStatus[]): Promise<JobRecord[]>
  getRepeatableJobs(): Promise<RepeatableJob[]>
  addRepeatable(name: string, data: unknown, pattern: string, tz?: string, jobId?: string): Promise<void>
  removeRepeatableByKey(key: string): Promise<boolean>
  close(): Promise<void>
}

export interface WorkerAdapter {
  close(): Promise<void>
}

export interface WorkerOptions {
  lockDuration?: number
}

export interface QueueFactory {
  createQueue(name: string): QueueAdapter
  createWorker<T = unknown>(name: string, processor: JobProcessor<T>, options?: WorkerOptions): WorkerAdapter
  close(): Promise<void>
}
