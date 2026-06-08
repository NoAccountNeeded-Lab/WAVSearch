import type { JobContext, JobProgress } from '@wivwav/queue'
import { createLogger, createNoopLogger, type WivWavLogger } from '@wivwav/logger'

export interface CountProgress {
  stage: string
  current: number
  total: number
  message?: string
}

const fallbackLogger = createFallbackLogger()

export const noopJobContext: JobContext = {
  logger: createNoopLogger(),
  async log(message: string): Promise<void> {
    this.logger?.info({ event: 'job.progress' }, message)
  },
  async updateProgress(_progress: unknown): Promise<void> {},
}

function createFallbackLogger(): WivWavLogger {
  const env = process.env['NODE_ENV'] ?? 'development'
  if (env === 'test') return createNoopLogger()
  return createLogger({ service: 'scraper', env })
}

export async function report(
  context: JobContext | undefined,
  message: string,
  progress?: JobProgress,
): Promise<void> {
  const logger = context?.logger ?? fallbackLogger
  logger.info(
    {
      event: 'job.progress',
      ...(progress !== undefined ? { progress } : {}),
    },
    message,
  )
  await context?.log(message)
  if (progress !== undefined) {
    await context?.updateProgress(progress)
  }
}
