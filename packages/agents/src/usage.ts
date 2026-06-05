import type { AgentRole } from './types.js'

export interface CompletionUsageContext {
  role?: AgentRole
  runId?: string
}

export interface CompletionUsage {
  provider: string
  model: string
  role?: AgentRole
  runId?: string
  inputTokens?: number
  outputTokens?: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

export type CompletionUsageLogger = (usage: CompletionUsage) => void

export function logCompletionUsage(usage: CompletionUsage): void {
  console.info(`[agents:usage] ${JSON.stringify(usage)}`)
}
