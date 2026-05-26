import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'WAV Search — Find Wheelchair Accessible Vehicles',
  description:
    'Search thousands of wheelchair accessible vehicles from dealers and private sellers across the US. Advanced filters, real-time analytics, and the best WAV search experience available.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0066CC',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
