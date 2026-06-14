export type AgentRole =
  | 'planner'
  | 'architect'
  | 'coder'
  | 'reviewer'
  | 'accessibility'
  | 'tester'
  | 'qa'
  | 'docs'
  | 'release'
  | 'human-liaison'

export type AgentStatus = 'completed' | 'failed'

export type PipelineStatus = 'success' | 'failed' | 'needs_revision'

export interface AgentArtifact {
  role: AgentRole
  content: string
  revision: number
}

export interface AgentStep {
  role: AgentRole
  status: AgentStatus
  artifact?: AgentArtifact
  requestsRevision: boolean
  error?: string
}

export interface AgentRun {
  id: string
  task: string
  provider: string
  status: PipelineStatus
  steps: AgentStep[]
  revision: number
  maxRevisions: number
  startedAt: string
  completedAt?: string
}
