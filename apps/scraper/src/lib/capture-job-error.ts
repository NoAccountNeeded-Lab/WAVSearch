/**
 * Wraps a BullMQ job processor to capture failures in Sentry before
 * re-throwing so BullMQ can mark the job as failed and apply retry logic.
 *
 * Using a wrapper keeps Sentry out of `packages/queue`, which must remain
 * vendor-agnostic per the observability architecture.
 */
import * as Sentry from '@sentry/node'
import type { JobContext, JobProcessor } from '@wivwav/queue'

export function withSentryCapture<T = unknown>(
  queueName: string,
  processor: JobProcessor<T>,
): JobProcessor<T> {
  return async (data: T, context: JobContext): Promise<void> => {
    try {
      await processor(data, context)
    } catch (err) {
      Sentry.withScope((scope) => {
        scope.setTag('queue', queueName)
        if (data && typeof data === 'object') {
          const record = data as Record<string, unknown>
          if (typeof record['sourceId'] === 'string') {
            scope.setTag('sourceId', record['sourceId'])
          }
        }
        Sentry.captureException(err)
      })
      throw err
    }
  }
}
