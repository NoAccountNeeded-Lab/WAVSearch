import { getPublicApiBaseUrl } from '@/lib/api-url'
import { RunsClient } from './RunsClient'

export default function RunsPage() {
  return <RunsClient apiBaseUrl={getPublicApiBaseUrl()} />
}
