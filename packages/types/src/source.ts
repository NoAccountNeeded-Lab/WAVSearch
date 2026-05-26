export type SourceStatus = 'active' | 'paused' | 'error' | 'needs_remapping'

export interface SourceSchedule {
  cronExpression: string
  timezone: string
}

export interface FieldMapping {
  targetField: string
  selector: string
  attribute: string | null
  transform: string | null
}

export interface Source {
  id: string
  name: string
  baseUrl: string
  status: SourceStatus
  schedule: SourceSchedule
  mappings: FieldMapping[]
  fingerprintHash: string | null
  lastScrapedAt: Date | null
  lastCheckedAt: Date | null
  listingCount: number
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}
