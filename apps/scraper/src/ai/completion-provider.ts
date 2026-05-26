export interface CompletionOptions {
  maxTokens?: number
  temperature?: number
}

export interface CompletionProvider {
  complete(systemPrompt: string, userPrompt: string, options?: CompletionOptions): Promise<string>
}
