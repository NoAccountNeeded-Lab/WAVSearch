import { getPublicApiBaseUrl } from '@/lib/api-url'
import { SourcesClient } from './SourcesClient'

export default function SourcesPage() {
  return <SourcesClient apiBaseUrl={getPublicApiBaseUrl()} />
}
