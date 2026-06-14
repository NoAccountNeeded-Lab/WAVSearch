/**
 * Sentry server-side configuration (Node.js runtime).
 *
 * Runs in Next.js API routes and server components that execute on the
 * Node.js runtime. Loaded via the instrumentation hook.
 *
 * PII scrubbing mirrors the client config — VINs, IPs, and dealer contact
 * data are removed before any event is sent to sentry.io.
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

    // Never capture user IPs from server-side requests
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
