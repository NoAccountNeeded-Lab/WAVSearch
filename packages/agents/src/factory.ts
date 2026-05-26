import type { CompletionProvider } from './provider.js'
import { AnthropicProvider } from './providers/anthropic.js'
import { OllamaProvider } from './providers/ollama.js'
import { OpenAIProvider } from './providers/openai.js'
import { CopilotProvider } from './providers/copilot.js'

export function createProvider(): CompletionProvider {
  const name = (process.env['AGENTS_PROVIDER'] || 'anthropic').toLowerCase()

  switch (name) {
    case 'anthropic':
      return new AnthropicProvider()
    case 'ollama':
      return new OllamaProvider()
    case 'openai':
      return new OpenAIProvider()
    case 'copilot':
      return new CopilotProvider()
    default:
      throw new Error(
        `Unknown AGENTS_PROVIDER "${name}". Valid options: anthropic, ollama, openai, copilot`,
      )
  }
}
