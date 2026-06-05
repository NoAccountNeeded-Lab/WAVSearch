import type { CompletionOptions, CompletionProvider } from './provider.js'

interface AnthropicMessage {
  content: Array<{ type: string; text: string }>
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

  constructor(config: { apiKey: string; model?: string; baseUrl?: string; promptCaching?: boolean }) {
    this.apiKey = config.apiKey
    this.model = config.model ?? 'claude-haiku-4-5-20251001'
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com'
    this.promptCaching = config.promptCaching ?? true
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
    return data.content?.[0]?.text ?? ''
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
