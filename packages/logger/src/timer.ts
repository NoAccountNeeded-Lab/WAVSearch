import type { WivWavLogger } from './logger.js'

/**
 * Times an async operation and logs its outcome.
 * Logs at `info` on success and `error` on failure, both with `durationMs`.
 * Always re-throws failures — never swallows errors.
 */
export async function withTimer<T>(
  logger: WivWavLogger,
  operationName: string,
  fields: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    logger.info({ ...fields, durationMs: Date.now() - start }, `${operationName} completed`)
    return result
  } catch (err) {
    logger.error({ ...fields, durationMs: Date.now() - start, err }, `${operationName} failed`)
    throw err
  }
}
