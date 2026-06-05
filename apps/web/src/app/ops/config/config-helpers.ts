export interface SecretRequest {
  key: string
  payload: {
    value: string
    type: 'secret'
    description?: string
  }
}

export function buildSecretRequest(key: string, value: string, description: string): SecretRequest | null {
  const trimmedKey = key.trim()
  if (!trimmedKey || value.length === 0) return null

  const trimmedDescription = description.trim()
  return {
    key: trimmedKey,
    payload: {
      value,
      type: 'secret',
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    },
  }
}
