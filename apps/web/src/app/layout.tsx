import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { GlobalErrorHandlers } from '@/components/GlobalErrorHandlers'
import { FetchErrorMonitor } from '@/components/FetchErrorMonitor'
import { getPublicApiBaseUrl } from '@/lib/api-url'

export const metadata: Metadata = {
  title: 'WAV Search — Find Wheelchair Accessible Vehicles',
  description:
    'Search thousands of wheelchair accessible vehicles from dealers and private sellers across the US. Filter by conversion type, lift, ramp, hand controls, and more.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#b85c00',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Expose the public API base URL to client components via a data attribute
  // so the browser-side error reporter can POST to /admin/client-events without
  // needing next/headers or build-time environment variables in client code.
  const apiBaseUrl = getPublicApiBaseUrl()

  return (
    <html lang="en">
      <body data-api-url={apiBaseUrl}>
        <GlobalErrorHandlers />
        <FetchErrorMonitor />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ErrorBoundary>
          <main id="main-content">
            {children}
          </main>
        </ErrorBoundary>
      </body>
    </html>
  )
}
