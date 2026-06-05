import { getPublicApiBaseUrl } from '@/lib/api-url'
import { ConfigClient } from './ConfigClient'

export default function ConfigPage() {
  return <ConfigClient apiBaseUrl={getPublicApiBaseUrl()} />
}
