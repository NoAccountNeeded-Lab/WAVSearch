export interface CompletionOptions {
  maxTokens?: number
  temperature?: number
}

export interface CompletionProvider {
  complete(systemPrompt: string, userPrompt: string, options?: CompletionOptions): Promise<string>
  readonly name: string
}

interface OllamaResponse {
  response: string
  done: boolean
}

export class OllamaProvider implements CompletionProvider {
  readonly name = 'ollama'
  private readonly baseUrl: string
  private readonly model: string

  constructor(config: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = config.baseUrl ?? process.env['AGENTS_OLLAMA_BASE_URL'] ?? 'http://localhost:11434'
    this.model = config.model ?? process.env['AGENTS_MODEL'] ?? 'llama3.2'
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
    return data.response
  }
}
