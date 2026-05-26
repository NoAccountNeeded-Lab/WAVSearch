export interface ScheduleOptions {
  timezone?: string
}

export interface Scheduler {
  schedule(cronExpression: string, task: () => void, options?: ScheduleOptions): void
}
