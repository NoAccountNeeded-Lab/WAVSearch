import Anthropic from '@anthropic-ai/sdk'
import type { CompletionProvider, CompletionOptions } from '../provider.js'

interface AnthropicConfig {
  apiKey?: string
  model?: string
}

export class AnthropicProvider implements CompletionProvider {
  readonly name = 'anthropic'
  private readonly client: Anthropic
  private readonly model: string

  constructor(config: AnthropicConfig = {}) {
    this.client = new Anthropic({ apiKey: config.apiKey ?? process.env['ANTHROPIC_API_KEY'] })
    this.model = config.model ?? process.env['AGENTS_MODEL'] ?? 'claude-sonnet-4-6'
  }

  async complete(systemPrompt: string, userPrompt: string, options: CompletionOptions = {}): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const block = message.content[0]
    if (!block || block.type !== 'text') throw new Error('Unexpected response type from Anthropic')
    return block.text
  }
}
