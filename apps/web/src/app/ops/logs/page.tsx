import { getPublicApiBaseUrl } from '@/lib/api-url'
import { LogsClient } from './LogsClient'

export default function LogsPage() {
  return <LogsClient apiBaseUrl={getPublicApiBaseUrl()} />
}
