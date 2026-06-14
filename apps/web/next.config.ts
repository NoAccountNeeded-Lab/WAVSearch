import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import type { SentryBuildOptions } from '@sentry/nextjs'

const config: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.blvd.com' },
      { protocol: 'https', hostname: '*.autotrader.com' },
      { protocol: 'https', hostname: '*.cargurus.com' },
    ],
  },
}

// Build Sentry options without passing `undefined` for optional properties that
// have exactOptionalPropertyTypes:true — only include each key when a value exists.
const sentryOptions: SentryBuildOptions = {
  ...(process.env['SENTRY_ORG'] !== undefined ? { org: process.env['SENTRY_ORG'] } : {}),
  ...(process.env['SENTRY_PROJECT'] !== undefined ? { project: process.env['SENTRY_PROJECT'] } : {}),
  ...(process.env['SENTRY_AUTH_TOKEN'] !== undefined ? { authToken: process.env['SENTRY_AUTH_TOKEN'] } : {}),

  // Only log source map upload messages when the auth token is present (CI/production).
  silent: process.env['SENTRY_AUTH_TOKEN'] === undefined,

  // Automatically tree-shake Sentry debug statements in production.
  disableLogger: true,

  // Use the tunnelled route to avoid ad-blocker interference.
  tunnelRoute: '/monitoring',

  // Delete source maps from the build output after uploading to Sentry so they
  // are not served to browsers in production.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Reduces bundle size by removing Sentry replay worker from the server bundle.
  widenClientFileUpload: true,
}

export default withSentryConfig(config, sentryOptions)
