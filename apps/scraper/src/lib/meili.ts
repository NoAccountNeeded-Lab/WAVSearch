import { Meilisearch } from 'meilisearch'

let client: Meilisearch | undefined

export function getMeiliClient(): Meilisearch {
  if (!client) {
    const apiKey = process.env['MEILI_API_KEY']
    client = new Meilisearch({
      host: process.env['MEILI_HOST'] ?? 'http://localhost:7700',
      ...(apiKey ? { apiKey } : {}),
    })
  }
  return client
}
