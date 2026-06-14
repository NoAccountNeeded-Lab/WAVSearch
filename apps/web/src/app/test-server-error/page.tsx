export const dynamic = 'force-dynamic'

// Temporary page for smoke-testing error.tsx — delete after verification
export default function TestServerErrorPage(): never {
  throw new Error('Smoke test server component error')
}
