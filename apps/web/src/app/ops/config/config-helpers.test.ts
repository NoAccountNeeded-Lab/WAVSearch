import { describe, expect, it } from 'vitest'
import { buildSecretRequest } from './config-helpers.js'

describe('buildSecretRequest', () => {
  it('trims the config key and description', () => {
    expect(buildSecretRequest(' secret.anthropic.default ', 'sk-test', ' Production key ')).toEqual({
      key: 'secret.anthropic.default',
      payload: {
        value: 'sk-test',
        type: 'secret',
        description: 'Production key',
      },
    })
  })

  it('preserves the secret value exactly', () => {
    expect(buildSecretRequest('secret.anthropic.default', '  sk-test-with-spaces  ', '')?.payload.value)
      .toBe('  sk-test-with-spaces  ')
  })

  it('omits an empty description', () => {
    expect(buildSecretRequest('secret.anthropic.default', 'sk-test', '   ')).toEqual({
      key: 'secret.anthropic.default',
      payload: {
        value: 'sk-test',
        type: 'secret',
      },
    })
  })

  it('returns null when key is blank', () => {
    expect(buildSecretRequest('  ', 'sk-test', '')).toBeNull()
  })

  it('returns null when value is empty', () => {
    expect(buildSecretRequest('secret.anthropic.default', '', '')).toBeNull()
  })
})
