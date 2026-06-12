/**
 * Browser-side error reporter.
 *
 * Sends structured error events to POST /admin/client-events so they flow
 * through pino → Loki and appear in /ops/logs alongside api/scraper logs.
 *
 * This module is safe to import in client components — it never runs on the
 * server and uses `window` guards for any environment-sensitive access.
 */

type ClientEventType = 'js-error' | 'unhandled-rejection' | 'fetch-error' | 'react-error'

export interface ClientEvent {
  type: ClientEventType
  message?: string
  stack?: string
  method?: string
  path?: string
  status?: number
  requestId?: string
  url?: string
  componentStack?: string
}

/**
 * The API base URL used for client-side requests. Set by the root layout via
 * a data attribute on <body> so browser code does not need next/headers or
 * environment variables.
 */
function getApiBaseUrl(): string {
  if (typeof document !== 'undefined') {
    const attr = document.body.getAttribute('data-api-url')
    if (attr) return attr
  }
  // Fallback for environments where the attribute is not yet available
  return ''
}

/**
 * Fire-and-forget POST to /admin/client-events.
 * Silently swallows any network or serialisation errors to avoid error loops.
 */
export function reportError(event: ClientEvent): void {
  const apiUrl = getApiBaseUrl()
  if (!apiUrl) return

  const endpoint = `${apiUrl}/admin/client-events`

  // Build payload explicitly to satisfy exactOptionalPropertyTypes —
  // undefined optional fields must not be spread into the object.
  const payload: ClientEvent = { type: event.type }
  if (event.message !== undefined) payload.message = event.message
  // Trim stacks to 4 KB to stay well within body limits
  if (event.stack !== undefined) payload.stack = event.stack.slice(0, 4096)
  if (event.method !== undefined) payload.method = event.method
  if (event.path !== undefined) payload.path = event.path
  if (event.status !== undefined) payload.status = event.status
  if (event.requestId !== undefined) payload.requestId = event.requestId
  if (event.componentStack !== undefined) payload.componentStack = event.componentStack.slice(0, 4096)
  // Always record the current page URL for context
  const resolvedUrl = typeof window !== 'undefined' ? window.location.href : event.url
  if (resolvedUrl !== undefined) payload.url = resolvedUrl

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive lets the request outlive the page during navigation
      keepalive: true,
      body: JSON.stringify(payload),
    })
  } catch {
    // Intentionally silent — never let the reporter itself throw
  }
}
