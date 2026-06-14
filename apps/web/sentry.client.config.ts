/**
 * Sentry client-side configuration.
 *
 * This file is auto-loaded by @sentry/nextjs when the instrumentation hook
 * is registered. It runs only in the browser.
 *
 * PII scrubbing rules are applied in `beforeSend` — VINs, IPs, and dealer
 * contact fields are stripped before any event leaves the browser.
 */
import * as Sentry from '@sentry/nextjs'

// VIN pattern: 17 alphanumeric characters (excluding I, O, Q)
const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g

/**
 * Strip VINs and common PII fields from Sentry event data.
 */
function scrubPii(value: string): string {
  return value.replace(VIN_PATTERN, '[VIN]')
}

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

  // Capture 10 % of transactions in production to avoid quota burn
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

  // Replay 1 % of sessions in production; 100 % when an error occurs
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  environment: process.env['NODE_ENV'] ?? 'development',

  beforeSend(event) {
    // Strip VINs from message and exception values
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

    // Remove user IP — we do not need it for debugging
    if (event.user) {
      delete event.user.ip_address
    }

    // Strip dealer contact fields from extra/contexts
    if (event.extra) {
      const sensitiveKeys = ['email', 'phone', 'dealer_email', 'dealer_phone', 'contact']
      for (const key of sensitiveKeys) {
        delete event.extra[key]
      }
    }

    return event
  },
})
