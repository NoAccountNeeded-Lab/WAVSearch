import type { NextConfig } from 'next'

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

export default config
