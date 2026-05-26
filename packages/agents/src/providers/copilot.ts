import OpenAI from 'openai'
import type { CompletionProvider, CompletionOptions } from '../provider.js'

interface CopilotConfig {
  token?: string
  model?: string
  baseURL?: string
}

// Uses GitHub Models API (OpenAI-compatible) — https://docs.github.com/en/github-models
export class CopilotProvider implements CompletionProvider {
  readonly name = 'copilot'
  private readonly client: OpenAI
  private readonly model: string

  constructor(config: CopilotConfig = {}) {
    const token = config.token ?? process.env['AGENTS_COPILOT_TOKEN'] ?? process.env['GITHUB_TOKEN']
    if (!token) throw new Error('CopilotProvider requires AGENTS_COPILOT_TOKEN or GITHUB_TOKEN')

    this.client = new OpenAI({
      apiKey: token,
      baseURL: config.baseURL ?? process.env['AGENTS_COPILOT_BASE_URL'] ?? 'https://models.inference.ai.azure.com',
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
