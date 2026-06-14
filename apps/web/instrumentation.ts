/**
 * Next.js instrumentation hook.
 *
 * This file is the official Next.js extension point for SDK initialisation.
 * It is called once per runtime before any request is served.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Forwards errors that are caught by the Next.js error boundary at the
 * framework level (e.g. errors in `generateStaticParams`, `generateMetadata`,
 * or during streaming render) to Sentry.
 *
 * This hook is distinct from the `error.tsx` component, which handles
 * render-time client errors. Both paths report to Sentry.
 *
 * The `request` parameter is a Next.js-specific RequestInfo shape
 * (path/method/headers), not the standard Fetch API `Request`.
 */
export const onRequestError = async (
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> => {
  const { captureRequestError } = await import('@sentry/nextjs')
  captureRequestError(error, request, context)
}
