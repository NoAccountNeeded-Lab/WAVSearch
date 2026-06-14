'use client'

import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

// Temporary page for smoke-testing ErrorBoundary — delete after verification
function BrokenComponent(): ReactNode {
  throw new Error('Smoke test render error')
}

export default function TestErrorPage() {
  return <BrokenComponent />
}
