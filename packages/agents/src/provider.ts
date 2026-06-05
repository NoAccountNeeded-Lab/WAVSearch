import type { CompletionUsageLogger } from './usage.js'
import type { AgentRole } from './types.js'

export interface CompletionOptions {
  maxTokens?: number
  temperature?: number
  usageContext?: {
    role?: AgentRole
    runId?: string
  }
}

export interface CompletionProvider {
  complete(systemPrompt: string, userPrompt: string, options?: CompletionOptions): Promise<string>
  readonly name: string
}

interface OllamaResponse {
  response: string
  done: boolean
  prompt_eval_count?: number
  eval_count?: number
}

export class OllamaProvider implements CompletionProvider {
  readonly name = 'ollama'
  private readonly baseUrl: string
  private readonly model: string
  private readonly usageLogger: CompletionUsageLogger | undefined

  constructor(config: { baseUrl?: string; model?: string; usageLogger?: CompletionUsageLogger } = {}) {
    this.baseUrl = config.baseUrl ?? process.env['AGENTS_OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
    this.model = config.model ?? process.env['AGENTS_MODEL'] ?? 'llama3.2'
    this.usageLogger = config.usageLogger
  }

  async complete(systemPrompt: string, userPrompt: string, options: CompletionOptions = {}): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: {
          num_predict: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.2,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OllamaResponse
    this.logUsage(data, options)
    return data.response
  }

  private logUsage(data: OllamaResponse, options: CompletionOptions): void {
    if (data.prompt_eval_count === undefined && data.eval_count === undefined) return
    this.usageLogger?.({
      provider: this.name,
      model: this.model,
      ...(options.usageContext?.role ? { role: options.usageContext.role } : {}),
      ...(options.usageContext?.runId ? { runId: options.usageContext.runId } : {}),
      ...(data.prompt_eval_count !== undefined ? { inputTokens: data.prompt_eval_count } : {}),
      ...(data.eval_count !== undefined ? { outputTokens: data.eval_count } : {}),
    })
  }
}
