'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/error-reporter'

/**
 * Next.js App Router error boundary for route segments.
 * Catches errors thrown by server components and client components within a
 * route segment and forwards them to the ops log collector.
 *
 * For errors in the root layout itself, see global-error.tsx.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError({
      type: 'js-error',
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    })
  }, [error])

  return (
    <div
      role="alert"
      style={{
        padding: '2rem',
        textAlign: 'center',
        color: '#1a1a1a',
        backgroundColor: '#ffffff',
      }}
    >
      <h2>An error occurred</h2>
      <p id="error-description">Something went wrong.</p>
      <button
        type="button"
        aria-describedby="error-description"
        onClick={reset}
        style={{ outline: '2px solid #1a1a1a', outlineOffset: '2px' }}
      >
        Try again
      </button>
    </div>
  )
}
