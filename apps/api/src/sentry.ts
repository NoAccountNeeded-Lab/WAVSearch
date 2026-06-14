/**
 * Sentry initialisation for the Fastify API.
 *
 * Import this module at the very top of `index.ts` — before any other imports
 * — so that unhandled exceptions thrown during startup are captured.
 *
 * PII scrubbing strips VINs, user IPs, and dealer contact fields from every
 * event before it is transmitted to sentry.io.
 */
import * as Sentry from '@sentry/node'

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g

function scrubPii(value: string): string {
  return value.replace(VIN_PATTERN, '[VIN]')
}

Sentry.init({
  dsn: process.env['SENTRY_DSN'],

  environment: process.env['NODE_ENV'] ?? 'development',

  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    if (event.message) {
      event.message = scrubPii(event.message)
    }
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) {
          ex.value = scrubPii(ex.value)
        }
      }
    }

    // Never capture user IPs
    if (event.user) {
      delete event.user.ip_address
    }

    if (event.extra) {
      const sensitiveKeys = ['email', 'phone', 'dealer_email', 'dealer_phone', 'contact']
      for (const key of sensitiveKeys) {
        delete event.extra[key]
      }
    }

    return event
  },
})

export { Sentry }
