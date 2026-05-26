import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WAV Search — Find Wheelchair Accessible Vehicles',
  description:
    'Search thousands of wheelchair accessible vehicles from dealers and private sellers across the US. Filter by conversion type, lift, ramp, hand controls, and more.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0052a3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  )
}
