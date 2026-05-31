import { getPublicApiBaseUrl } from '@/lib/api-url'
import { SchedulesClient } from './SchedulesClient'

export default function SchedulesPage() {
  return <SchedulesClient apiBaseUrl={getPublicApiBaseUrl()} />
}
