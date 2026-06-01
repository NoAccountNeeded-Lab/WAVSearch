import { MeiliSearch } from 'meilisearch'

let client: MeiliSearch | undefined

export function getMeiliClient(): MeiliSearch {
  if (!client) {
    const apiKey = process.env['MEILI_API_KEY']
    client = new MeiliSearch({
      host: process.env['MEILI_HOST'] ?? 'http://localhost:7700',
      ...(apiKey ? { apiKey } : {}),
    })
  }
  return client
}
