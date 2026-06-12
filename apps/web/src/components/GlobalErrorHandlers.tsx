'use client'

import { useEffect } from 'react'
import { type ClientEvent, reportError } from '../lib/error-reporter.js'

/**
 * Mounts global browser error handlers on the client.
 *
 * Captures:
 * - Uncaught JS exceptions via `window.onerror`
 * - Unhandled promise rejections via `window.onunhandledrejection`
 *
 * Renders nothing — this component exists only for its side-effects.
 * Place it inside the root layout (after <body>) so it is active for all routes.
 */
export function GlobalErrorHandlers(): null {
  useEffect(() => {
    function handleError(event: ErrorEvent): void {
      const e: ClientEvent = { type: 'js-error', message: event.message }
      if (event.error instanceof Error && event.error.stack !== undefined) {
        e.stack = event.error.stack
      }
      reportError(e)
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent): void {
      const reason: unknown = event.reason
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : '[unhandled rejection]'

      const e: ClientEvent = { type: 'unhandled-rejection', message }
      if (reason instanceof Error && reason.stack !== undefined) {
        e.stack = reason.stack
      }
      reportError(e)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
