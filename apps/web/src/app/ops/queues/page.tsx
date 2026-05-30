import { getPublicApiBaseUrl } from '@/lib/api-url'
import { QueuesClient } from './QueuesClient'

export default function QueuesPage() {
  return <QueuesClient apiBaseUrl={getPublicApiBaseUrl()} />
}
