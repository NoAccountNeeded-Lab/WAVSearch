'use client'

import { useEffect } from 'react'
import { reportError } from '../lib/error-reporter.js'

/**
 * Patches `window.fetch` to intercept 4xx/5xx responses from the API and
 * forward them to the ops log collector.
 *
 * Only paths that start with `/` or point to the same origin as the current
 * page are monitored — cross-origin requests (e.g. CDN assets, Meilisearch)
 * are skipped to avoid noise.
 *
 * Renders nothing — this component exists only for its side-effects.
 * Place it in the root layout alongside GlobalErrorHandlers.
 */
export function FetchErrorMonitor(): null {
  useEffect(() => {
    const originalFetch = window.fetch

    const patchedFetch = async function(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await originalFetch(input, init)

      if (response.status >= 400) {
        const rawUrl = input instanceof Request ? input.url : String(input)

        // Derive a safe path (strip origin and query string)
        let path: string
        try {
          path = new URL(rawUrl, window.location.origin).pathname
        } catch {
          path = rawUrl
        }

        // Skip the error-reporter endpoint unconditionally to prevent recursive loops.
        // This guard fires before the same-origin check and protects against recursion in
        // both cross-origin API deployments and same-origin proxy deployments (where
        // isSameOrigin would be true but we must never report on the reporting endpoint itself).
        if (path === '/admin/client-events') return response

        // Only monitor same-origin requests — use host (hostname+port) not just hostname
        // so that localhost:3003 (API) is treated as cross-origin from localhost:3000 (web)
        // in development, avoiding false positives from the API being on a different port.
        const isSameOrigin =
          rawUrl.startsWith('/') ||
          (() => {
            try {
              return new URL(rawUrl).host === window.location.host
            } catch {
              return false
            }
          })()

        if (isSameOrigin) {
          const method =
            (init?.method ?? (input instanceof Request ? input.method : undefined) ?? 'GET').toUpperCase()

          reportError({
            type: 'fetch-error',
            message: `${method} ${path} → ${response.status}`,
            method,
            path,
            status: response.status,
            url: window.location.href,
          })
        }
      }

      return response
    }

    window.fetch = patchedFetch

    return () => {
      if (window.fetch === patchedFetch) window.fetch = originalFetch
    }
  }, [])

  return null
}
