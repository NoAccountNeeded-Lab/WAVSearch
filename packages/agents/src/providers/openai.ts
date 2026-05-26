import OpenAI from 'openai'
import type { CompletionProvider, CompletionOptions } from '../provider.js'

interface OpenAIConfig {
  apiKey?: string
  model?: string
  baseURL?: string
}

export class OpenAIProvider implements CompletionProvider {
  readonly name = 'openai'
  private readonly client: OpenAI
  private readonly model: string

  constructor(config: OpenAIConfig = {}) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env['OPENAI_API_KEY'],
      baseURL: config.baseURL,
    })
    this.model = config.model ?? process.env['AGENTS_MODEL'] ?? 'gpt-4o'
  }

  async complete(systemPrompt: string, userPrompt: string, options: CompletionOptions = {}): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    return response.choices[0]?.message?.content ?? ''
  }
}
