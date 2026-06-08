import type { AgentRole } from './types.js'
import { createLogger, type WivWavLogger } from '@wivwav/logger'

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

const logger = createLogger({
  service: 'agents',
  env: process.env['NODE_ENV'] ?? 'development',
})

export function logCompletionUsage(
  usage: CompletionUsage,
  targetLogger: WivWavLogger = logger,
): void {
  targetLogger.info({ event: 'agents.usage', ...usage }, 'Agent completion usage')
}
