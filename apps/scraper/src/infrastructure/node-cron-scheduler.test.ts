import { describe, it, expect, vi } from 'vitest'
import { NodeCronScheduler } from './node-cron-scheduler.js'

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}))

describe('NodeCronScheduler', () => {
  it('delegates to node-cron with expression, task, and timezone', async () => {
    const cron = await import('node-cron')
    const scheduler = new NodeCronScheduler()
    const task = vi.fn()

    scheduler.schedule('0 */6 * * *', task, { timezone: 'America/New_York' })

    expect(cron.default.schedule).toHaveBeenCalledWith(
      '0 */6 * * *',
      task,
      { timezone: 'America/New_York' },
    )
  })

  it('passes undefined timezone when none provided', async () => {
    const cron = await import('node-cron')
    const scheduler = new NodeCronScheduler()
    const task = vi.fn()

    scheduler.schedule('0 * * * *', task)

    expect(cron.default.schedule).toHaveBeenCalledWith('0 * * * *', task, { timezone: undefined })
  })
})
