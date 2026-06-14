/**
 * Sentry edge runtime configuration.
 *
 * Used by Next.js middleware and any route segments that opt into the edge
 * runtime. The edge runtime has a restricted API surface so this config is
 * intentionally minimal — no Node.js built-ins, no `dns` lookups.
 *
 * PII scrubbing mirrors the other Sentry configs.
 */
import * as Sentry from '@sentry/nextjs'

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g

function scrubPii(value: string): string {
  return value.replace(VIN_PATTERN, '[VIN]')
}

Sentry.init({
  dsn: process.env['SENTRY_DSN'],

  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

  environment: process.env['NODE_ENV'] ?? 'development',

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
