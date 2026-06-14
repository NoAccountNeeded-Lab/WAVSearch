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
const IP_HEADER_KEYS = new Set(['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded'])
const SENSITIVE_EXTRA_KEYS = ['email', 'phone', 'dealer_email', 'dealer_phone', 'contact']

function scrubPii(value: string): string {
  return value.replace(VIN_PATTERN, '[VIN]')
}

function scrubIpHeaders(headers: Record<string, unknown> | undefined): void {
  if (!headers) return

  for (const key of Object.keys(headers)) {
    if (IP_HEADER_KEYS.has(key.toLowerCase())) {
      delete headers[key]
    }
  }
}

Sentry.init({
  dsn: process.env['SENTRY_DSN'],

  environment: process.env['NODE_ENV'] ?? 'development',

  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = scrubPii(breadcrumb.message)
    }

    const data = breadcrumb.data
    const url = data?.['url']
    if (data && typeof url === 'string') {
      data['url'] = scrubPii(url)
    }

    return breadcrumb
  },

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
    scrubIpHeaders(event.request?.headers)

    if (event.extra) {
      for (const key of SENSITIVE_EXTRA_KEYS) {
        delete event.extra[key]
      }
    }

    return event
  },
})

export { Sentry }
