import { getPublicApiBaseUrl } from '@/lib/api-url'
import { AIClient } from './AIClient'

export default function AiPage() {
  return <AIClient apiBaseUrl={getPublicApiBaseUrl()} />
}
