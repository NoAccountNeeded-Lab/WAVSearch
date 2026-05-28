import type { CompletionProvider, CompletionOptions } from './completion-provider.js'

const AVAILABILITY_TIMEOUT_MS = 1500

interface OllamaConfig {
  baseUrl?: string
  model?: string
}

interface OllamaResponse {
  response: string
  done: boolean
}

export class OllamaProvider implements CompletionProvider {
  private readonly baseUrl: string
  private readonly model: string

  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434'
    this.model = config.model ?? 'llama3.2'
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
      })
      return response.ok
    } catch {
      return false
    }
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
          num_predict: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.1,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OllamaResponse
    return data.response
  }
}
