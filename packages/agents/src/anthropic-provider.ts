import type { CompletionOptions, CompletionProvider } from './provider.js'
import type { CompletionUsageLogger } from './usage.js'

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

type AnthropicSystemPrompt =
  | string
  | Array<{
      type: 'text'
      text: string
      cache_control?: { type: 'ephemeral' }
    }>

export class AnthropicProvider implements CompletionProvider {
  readonly name = 'anthropic'
  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string
  private readonly promptCaching: boolean
  private readonly usageLogger: CompletionUsageLogger | undefined

  constructor(config: {
    apiKey: string
    model?: string
    baseUrl?: string
    promptCaching?: boolean
    usageLogger?: CompletionUsageLogger
  }) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'claude-haiku-4-5-20251001'
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com'
    this.promptCaching = config.promptCaching ?? true
    this.usageLogger = config.usageLogger
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    const system = this.buildSystemPrompt(systemPrompt)

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Anthropic request failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`)
    }

    const data = (await response.json()) as AnthropicMessage
    this.logUsage(data, options)
    return data.content?.[0]?.text ?? ''
  }

  private logUsage(data: AnthropicMessage, options: CompletionOptions): void {
    if (!data.usage) return
    this.usageLogger?.({
      provider: this.name,
      model: this.model,
      ...(options.usageContext?.role ? { role: options.usageContext.role } : {}),
      ...(options.usageContext?.runId ? { runId: options.usageContext.runId } : {}),
      ...(data.usage.input_tokens !== undefined ? { inputTokens: data.usage.input_tokens } : {}),
      ...(data.usage.output_tokens !== undefined ? { outputTokens: data.usage.output_tokens } : {}),
      ...(data.usage.cache_creation_input_tokens !== undefined
        ? { cacheCreationInputTokens: data.usage.cache_creation_input_tokens }
        : {}),
      ...(data.usage.cache_read_input_tokens !== undefined
        ? { cacheReadInputTokens: data.usage.cache_read_input_tokens }
        : {}),
    })
  }

  private buildSystemPrompt(systemPrompt: string): AnthropicSystemPrompt {
    if (!this.promptCaching) return systemPrompt
    return [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ]
  }
}
