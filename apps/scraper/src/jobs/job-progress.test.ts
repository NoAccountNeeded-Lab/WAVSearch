import { describe, expect, it, vi } from 'vitest'
import type { JobContext } from '@wivwav/queue'
import type { WivWavLogger } from '@wivwav/logger'
import { report } from './job-progress.js'

describe('report', () => {
  it('writes structured job progress through the contextual logger', async () => {
    const info = vi.fn()
    const context: JobContext = {
      logger: {
        info,
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        level: 'info',
        child: vi.fn(),
      } as unknown as WivWavLogger,
      log: vi.fn(),
      updateProgress: vi.fn(),
    }
    const progress = { stage: 'crawl', current: 1, total: 2 }

    await report(context, 'Crawled page', progress)

    expect(info).toHaveBeenCalledWith(
      {
        event: 'job.progress',
        progress,
      },
      'Crawled page',
    )
    expect(context.log).toHaveBeenCalledWith('Crawled page')
    expect(context.updateProgress).toHaveBeenCalledWith(progress)
  })
})
