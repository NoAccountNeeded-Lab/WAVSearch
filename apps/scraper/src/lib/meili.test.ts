import { afterEach, describe, expect, it, vi } from 'vitest'

describe('getMeiliClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns a Meilisearch instance', async () => {
    vi.stubEnv('MEILI_HOST', 'http://localhost:7700')
    vi.stubEnv('MEILI_API_KEY', 'test-key')
    const { getMeiliClient } = await import('./meili.js')
    const client = getMeiliClient()
    expect(client).toBeDefined()
    expect(typeof client.index).toBe('function')
  })

  it('returns the same instance on repeated calls (singleton)', async () => {
    vi.stubEnv('MEILI_HOST', 'http://localhost:7700')
    vi.stubEnv('MEILI_API_KEY', 'test-key')
    const { getMeiliClient } = await import('./meili.js')
    const first = getMeiliClient()
    const second = getMeiliClient()
    expect(first).toBe(second)
  })

  it('defaults host to http://localhost:7700 when MEILI_HOST is unset', async () => {
    vi.stubEnv('MEILI_API_KEY', 'test-key')
    const orig = process.env['MEILI_HOST']
    delete process.env['MEILI_HOST']
    try {
      const { getMeiliClient } = await import('./meili.js')
      const client = getMeiliClient()
      // The Meilisearch SDK exposes the configured host on the client config
      expect((client as unknown as { config: { host: string } }).config.host).toBe(
        'http://localhost:7700',
      )
    } finally {
      if (orig !== undefined) process.env['MEILI_HOST'] = orig
    }
  })

  it('omits apiKey from config when MEILI_API_KEY is unset', async () => {
    vi.stubEnv('MEILI_HOST', 'http://localhost:7700')
    const orig = process.env['MEILI_API_KEY']
    delete process.env['MEILI_API_KEY']
    try {
      const { getMeiliClient } = await import('./meili.js')
      const client = getMeiliClient()
      const apiKey = (client as unknown as { config: { apiKey?: string } }).config.apiKey
      expect(apiKey).toBeUndefined()
    } finally {
      if (orig !== undefined) process.env['MEILI_API_KEY'] = orig
    }
  })

  it('uses MEILI_HOST when set', async () => {
    vi.stubEnv('MEILI_HOST', 'http://meili.internal:7700')
    vi.stubEnv('MEILI_API_KEY', 'prod-key')
    const { getMeiliClient } = await import('./meili.js')
    const client = getMeiliClient()
    expect((client as unknown as { config: { host: string } }).config.host).toBe(
      'http://meili.internal:7700',
    )
  })
})
