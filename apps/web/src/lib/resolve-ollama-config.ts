import { getServerApiBaseUrl } from './api-url'
import { apiFetch } from './api-fetch'

export const OLLAMA_DEFAULT_MODEL = 'llama3.2'
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434'

/** Resolve Ollama base URL and model for a given config key, with env and hardcoded fallbacks. */
export async function resolveOllamaConfig(modelConfigKey: string): Promise<{
  model: string
  baseUrl: string
}> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? OLLAMA_DEFAULT_BASE_URL
  const apiBase = getServerApiBaseUrl()

  try {
    const res = await apiFetch(`${apiBase}/admin/config/${encodeURIComponent(modelConfigKey)}`, {
      cache: 'no-store',
    })
    const body = res.ok ? (await res.json() as { data: { value: unknown } }) : null
    const model =
      typeof body?.data?.value === 'string' ? body.data.value : OLLAMA_DEFAULT_MODEL
    return { model, baseUrl }
  } catch {
    return { model: OLLAMA_DEFAULT_MODEL, baseUrl }
  }
}
