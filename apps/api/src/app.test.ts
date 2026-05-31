import { describe, expect, it } from 'vitest'
import { isAllowedCorsOrigin } from './app.js'
import type { Config } from './config.js'

const baseConfig: Config = {
  NODE_ENV: 'production',
  PORT: 3001,
  HOST: '0.0.0.0',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/wavsearch',
  MEILISEARCH_HOST: 'http://localhost:7700',
  MEILISEARCH_API_KEY: 'test',
  VALKEY_URL: 'redis://localhost:6379',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_REQUIRED: false,
  CORS_ORIGIN: ['http://localhost:3000'],
}

describe('isAllowedCorsOrigin', () => {
  it('allows explicitly configured origins', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', baseConfig)).toBe(true)
  })

  it('allows arbitrary localhost ports in development', () => {
    expect(isAllowedCorsOrigin('http://localhost:3002', {
      ...baseConfig,
      NODE_ENV: 'development',
    })).toBe(true)
  })

  it('does not allow arbitrary origins outside development', () => {
    expect(isAllowedCorsOrigin('http://localhost:3002', baseConfig)).toBe(false)
    expect(isAllowedCorsOrigin('https://example.com', {
      ...baseConfig,
      NODE_ENV: 'development',
    })).toBe(false)
  })
})
