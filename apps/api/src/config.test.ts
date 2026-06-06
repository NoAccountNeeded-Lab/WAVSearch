import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadConfig } from './config.js'

// Minimal env that satisfies all required fields
const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/wivwav',
  MEILISEARCH_API_KEY: 'test-key',
}


afterEach(() => {
  vi.unstubAllEnvs()
})

describe('loadConfig', () => {
  it('loads successfully with required fields only', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)

    const config = loadConfig()
    expect(config.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL)
    expect(config.MEILISEARCH_API_KEY).toBe(REQUIRED_ENV.MEILISEARCH_API_KEY)
    // NODE_ENV defaults to 'development' but the test runner sets it to 'test'
    expect(['development', 'test']).toContain(config.NODE_ENV)
    expect(config.PORT).toBe(3003)
  })

  it('throws when DATABASE_URL is missing', () => {
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    // Intentionally not stubbing DATABASE_URL
    const origDb = process.env['DATABASE_URL']
    delete process.env['DATABASE_URL']
    try {
      expect(() => loadConfig()).toThrow('Invalid environment configuration')
    } finally {
      if (origDb !== undefined) process.env['DATABASE_URL'] = origDb
    }
  })

  it('accepts a valid 64-char hex CONFIG_ENCRYPTION_SECRET', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    vi.stubEnv('CONFIG_ENCRYPTION_SECRET', 'a'.repeat(64))

    const config = loadConfig()
    expect(config.CONFIG_ENCRYPTION_SECRET).toBe('a'.repeat(64))
  })

  it('throws when CONFIG_ENCRYPTION_SECRET has fewer than 64 hex chars', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    vi.stubEnv('CONFIG_ENCRYPTION_SECRET', 'abc123')

    expect(() => loadConfig()).toThrow('Invalid environment configuration')
  })

  it('throws when CONFIG_ENCRYPTION_SECRET contains non-hex characters', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    vi.stubEnv('CONFIG_ENCRYPTION_SECRET', 'g'.repeat(64)) // 'g' is not hex

    expect(() => loadConfig()).toThrow('Invalid environment configuration')
  })

  it('allows CONFIG_ENCRYPTION_SECRET to be absent (optional)', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    // Ensure the env var is not set
    const orig = process.env['CONFIG_ENCRYPTION_SECRET']
    delete process.env['CONFIG_ENCRYPTION_SECRET']
    try {
      const config = loadConfig()
      expect(config.CONFIG_ENCRYPTION_SECRET).toBeUndefined()
    } finally {
      if (orig !== undefined) process.env['CONFIG_ENCRYPTION_SECRET'] = orig
    }
  })

  it('coerces CORS_ORIGIN with commas into an array', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000,http://localhost:3001')

    const config = loadConfig()
    expect(Array.isArray(config.CORS_ORIGIN)).toBe(true)
    expect(config.CORS_ORIGIN).toContain('http://localhost:3000')
    expect(config.CORS_ORIGIN).toContain('http://localhost:3001')
  })

  it('leaves CORS_ORIGIN as a string when there is no comma', () => {
    vi.stubEnv('DATABASE_URL', REQUIRED_ENV.DATABASE_URL)
    vi.stubEnv('MEILISEARCH_API_KEY', REQUIRED_ENV.MEILISEARCH_API_KEY)
    vi.stubEnv('CORS_ORIGIN', 'http://localhost:3000')

    const config = loadConfig()
    expect(config.CORS_ORIGIN).toBe('http://localhost:3000')
  })
})
