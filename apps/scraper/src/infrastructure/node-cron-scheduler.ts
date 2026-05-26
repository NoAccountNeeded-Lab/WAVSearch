import cron from 'node-cron'
import type { Scheduler, ScheduleOptions } from '../engine/scheduler.js'

export class NodeCronScheduler implements Scheduler {
  schedule(cronExpression: string, task: () => void, options: ScheduleOptions = {}): void {
    cron.schedule(cronExpression, task, options.timezone ? { timezone: options.timezone } : {})
  }
}
