import type { FastifyPluginAsync } from 'fastify'

/**
 * Payload shape posted by the browser error collector.
 *
 * All fields except `type` are optional — the client sends what it has and
 * the server normalises missing values to null before logging.
 */
interface ClientEventBody {
  /** Discriminates the error category */
  type: 'js-error' | 'unhandled-rejection' | 'fetch-error' | 'react-error'
  /** Human-readable error message */
  message?: string
  /** Stack trace string, if available */
  stack?: string
  /** For fetch-error: HTTP method (GET, POST, …) */
  method?: string
  /** For fetch-error: the URL path that failed */
  path?: string
  /** For fetch-error: the HTTP status code returned */
  status?: number
  /** requestId from the current page load for correlation */
  requestId?: string
  /** Current window.location.href when the error occurred */
  url?: string
  /** Component stack from React error boundary */
  componentStack?: string
}

const clientEventBodySchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { type: 'string', enum: ['js-error', 'unhandled-rejection', 'fetch-error', 'react-error'] },
    message: { type: 'string', maxLength: 512 },
    stack: { type: 'string', maxLength: 8192 },
    method: { type: 'string', maxLength: 16 },
    path: { type: 'string', maxLength: 2048 },
    status: { type: 'integer', minimum: 100, maximum: 599 },
    requestId: { type: 'string', maxLength: 128 },
    url: { type: 'string', maxLength: 2048 },
    componentStack: { type: 'string', maxLength: 8192 },
  },
  additionalProperties: false,
} as const

export const adminClientEventsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /admin/client-events
   *
   * Ingests a browser error event and logs it via pino so it flows through
   * the existing Loki pipeline and appears in /ops/logs alongside api/scraper
   * logs. The service label is set to "web-client" for easy filtering.
   *
   * This endpoint is intentionally unauthenticated — it accepts only
   * pre-validated structured events and rate-limited at the framework level.
   * No user-identifying data is logged.
   */
  app.post<{ Body: ClientEventBody }>(
    '/',
    { schema: { body: clientEventBodySchema } },
    async (req, reply) => {
      const { type, message, stack, method, path, status, requestId, url, componentStack } =
        req.body

      const level = (() => {
        if (type === 'fetch-error' && status !== undefined && status < 500) return 'warn'
        return 'error'
      })()

      const logPayload: Record<string, unknown> = {
        // Tag with "web-client" so /ops/logs service filter works
        service: 'web-client',
        eventType: type,
        message: message ?? `[${type}]`,
        ...(stack ? { stack } : {}),
        ...(method ? { method } : {}),
        ...(path ? { path } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(requestId ? { requestId } : {}),
        ...(url ? { clientUrl: url } : {}),
        ...(componentStack ? { componentStack } : {}),
      }

      if (level === 'error') {
        req.log.error(logPayload, logPayload.message as string)
      } else {
        req.log.warn(logPayload, logPayload.message as string)
      }

      return reply.code(204).send()
    },
  )
}
