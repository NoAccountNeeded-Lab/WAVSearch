import { describe, it, expect, vi, afterEach } from 'vitest'
import { encryptSecret, decryptSecret, ConfigService } from './config-service.js'

// 32-byte (64 hex chars) key for AES-256-GCM
const TEST_SECRET = 'b'.repeat(64)

afterEach(() => {
  vi.clearAllMocks()
})

// ── encryptSecret / decryptSecret ─────────────────────────────────────────

describe('encryptSecret', () => {
  it('returns a colon-separated iv:authTag:ciphertext string', () => {
    const result = encryptSecret('hello', TEST_SECRET)
    const parts = result.split(':')
    expect(parts).toHaveLength(3)
    // Each part is non-empty hex
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0)
      expect(/^[0-9a-f]+$/i.test(part)).toBe(true)
    }
  })

  it('produces different ciphertexts for the same input (random IV)', () => {
    const a = encryptSecret('same-value', TEST_SECRET)
    const b = encryptSecret('same-value', TEST_SECRET)
    expect(a).not.toBe(b)
  })
})

describe('decryptSecret', () => {
  it('round-trips a plaintext value', () => {
    const plain = 'sk-ant-api-super-secret-key-9999'
    expect(decryptSecret(encryptSecret(plain, TEST_SECRET), TEST_SECRET)).toBe(plain)
  })

  it('throws when the encrypted value does not have exactly three parts', () => {
    expect(() => decryptSecret('onlyone', TEST_SECRET)).toThrow('Invalid encrypted value format')
    expect(() => decryptSecret('two:parts', TEST_SECRET)).toThrow('Invalid encrypted value format')
    expect(() => decryptSecret('a:b:c:d', TEST_SECRET)).toThrow('Invalid encrypted value format')
  })
})

// ── ConfigService.get ──────────────────────────────────────────────────────

describe('ConfigService.get', () => {
  function makeCache(overrides: Record<string, unknown> = {}) {
    return {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      ...overrides,
    }
  }

  const baseRow = {
    id: 'id1',
    key: 'ai.provider',
    value: 'anthropic',
    type: 'string',
    description: null,
    encryptedValue: null,
    hint: null,
    createdAt: new Date('2026-06-04T00:00:00Z'),
    createdBy: null,
  }

  it('returns null when the key does not exist in DB', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => null) } }
    const svc = new ConfigService(db as never, makeCache() as never, TEST_SECRET)
    expect(await svc.get('missing.key')).toBeNull()
  })

  it('returns a mapped row from DB on cache miss', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => baseRow) } }
    const cache = makeCache()
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    const result = await svc.get('ai.provider')
    expect(result?.key).toBe('ai.provider')
    expect(result?.value).toBe('anthropic')
    expect(db.configEntry.findFirst).toHaveBeenCalledOnce()
  })

  it('writes the result to cache after a DB hit', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => baseRow) } }
    const cache = makeCache()
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    await svc.get('ai.provider')
    expect(cache.set).toHaveBeenCalledWith('config:ai.provider', expect.any(String), 'EX', 60)
  })

  it('returns cached value without hitting DB on cache hit', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => baseRow) } }
    const cache = makeCache({
      get: vi.fn(async () => JSON.stringify(baseRow)),
    })
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    const result = await svc.get('ai.provider')
    expect(result?.key).toBe('ai.provider')
    expect(db.configEntry.findFirst).not.toHaveBeenCalled()
  })

  it('falls through to DB on corrupt (non-JSON) cache value', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => baseRow) } }
    const cache = makeCache({
      get: vi.fn(async () => 'not-valid-json{{{'),
    })
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    const result = await svc.get('ai.provider')
    expect(result?.key).toBe('ai.provider')
    expect(db.configEntry.findFirst).toHaveBeenCalledOnce()
  })
})

// ── ConfigService.getSecret ───────────────────────────────────────────────

describe('ConfigService.getSecret', () => {
  const encryptedValue = encryptSecret('sk-real-key', TEST_SECRET)

  const secretRow = {
    id: 'id2',
    key: 'secret.anthropic.default',
    value: null,
    type: 'secret',
    description: null,
    encryptedValue,
    hint: 'y-ke',
    createdAt: new Date(),
    createdBy: null,
  }

  it('returns null when no encryption secret is configured', async () => {
    const db = { configEntry: { findFirst: vi.fn() } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, undefined)
    expect(await svc.getSecret('secret.anthropic.default')).toBeNull()
    expect(db.configEntry.findFirst).not.toHaveBeenCalled()
  })

  it('returns null when no row exists for the key', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => null) } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    expect(await svc.getSecret('missing.key')).toBeNull()
  })

  it('returns null when the row has no encryptedValue', async () => {
    const row = { ...secretRow, encryptedValue: null }
    const db = { configEntry: { findFirst: vi.fn(async () => row) } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    expect(await svc.getSecret('secret.anthropic.default')).toBeNull()
  })

  it('decrypts and returns the plaintext secret', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => secretRow) } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)
    expect(await svc.getSecret('secret.anthropic.default')).toBe('sk-real-key')
  })
})

// ── ConfigService.set ─────────────────────────────────────────────────────

describe('ConfigService.set', () => {
  const createdRow = {
    id: 'id3',
    key: 'ai.intake.provider',
    value: 'anthropic',
    type: 'string',
    description: null,
    encryptedValue: null,
    hint: null,
    createdAt: new Date(),
    createdBy: null,
  }

  it('stores a plain string value', async () => {
    const create = vi.fn(async () => createdRow)
    const db = { configEntry: { create } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn(async () => 1) }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    const result = await svc.set({ key: 'ai.intake.provider', value: 'anthropic', type: 'string' })
    expect(result.key).toBe('ai.intake.provider')
    expect(create).toHaveBeenCalledOnce()
  })

  it('invalidates cache after write', async () => {
    const create = vi.fn(async () => createdRow)
    const db = { configEntry: { create } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn(async () => 1) }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    await svc.set({ key: 'ai.intake.provider', value: 'anthropic', type: 'string' })
    expect(cache.del).toHaveBeenCalledWith('config:ai.intake.provider')
  })

  it('encrypts secrets and stores hint + encryptedValue, not plaintext', async () => {
    const secretPlain = 'sk-ant-api-prod-0000'
    const capturedData: Record<string, unknown>[] = []
    const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
      capturedData.push(args.data)
      return {
        id: 'id4',
        key: 'secret.anthropic.default',
        value: null,
        type: 'secret',
        description: null,
        encryptedValue: 'cipherblob',
        hint: '0000',
        createdAt: new Date(),
        createdBy: null,
      }
    })
    const db = { configEntry: { create } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn(async () => 1) }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    await svc.set({ key: 'secret.anthropic.default', value: secretPlain, type: 'secret' })

    const data = capturedData[0]!
    expect(data['encryptedValue']).toBeDefined()
    expect(data['encryptedValue']).not.toBe(secretPlain)
    // Stored value must not be the plaintext
    expect(data['value']).not.toBe(secretPlain)
    expect(data['hint']).toBe('0000') // last 4 chars of 'sk-ant-api-prod-0000'
  })

  it('throws when attempting to store a secret without an encryption secret', async () => {
    const db = { configEntry: { create: vi.fn() } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, undefined)

    await expect(
      svc.set({ key: 'secret.key', value: 'some-secret', type: 'secret' })
    ).rejects.toThrow('CONFIG_ENCRYPTION_SECRET is required')
  })

  it('throws when secret value is not a string', async () => {
    const db = { configEntry: { create: vi.fn() } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    await expect(
      svc.set({ key: 'secret.key', value: 42 as never, type: 'secret' })
    ).rejects.toThrow('Secret value must be a string')
  })
})

// ── ConfigService.delete ──────────────────────────────────────────────────

describe('ConfigService.delete', () => {
  const existingRow = {
    id: 'id5',
    key: 'ai.intake.provider',
    value: 'anthropic',
    type: 'string',
    description: 'provider',
    encryptedValue: null,
    hint: null,
    createdAt: new Date(),
    createdBy: null,
  }

  it('throws when deleting a key that does not exist', async () => {
    const db = { configEntry: { findFirst: vi.fn(async () => null), create: vi.fn() } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    await expect(svc.delete('nonexistent.key')).rejects.toThrow('not found')
    expect(db.configEntry.create).not.toHaveBeenCalled()
  })

  it('inserts a tombstone row when the key exists', async () => {
    const create = vi.fn(async () => ({ ...existingRow, value: null }))
    const db = { configEntry: { findFirst: vi.fn(async () => existingRow), create } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn(async () => 1) }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    await svc.delete('ai.intake.provider')
    expect(create).toHaveBeenCalledOnce()
  })

  it('invalidates cache after delete', async () => {
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn(async () => 1) }
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => existingRow),
        create: vi.fn(async () => ({ ...existingRow, value: null })),
      },
    }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    await svc.delete('ai.intake.provider')
    expect(cache.del).toHaveBeenCalledWith('config:ai.intake.provider')
  })
})

// ── ConfigService.history ─────────────────────────────────────────────────

describe('ConfigService.history', () => {
  it('returns all rows ordered newest-first', async () => {
    const rows = [
      { id: 'h2', key: 'ai.provider', value: 'ollama', type: 'string', description: null, encryptedValue: null, hint: null, createdAt: new Date('2026-06-04T02:00:00Z'), createdBy: null },
      { id: 'h1', key: 'ai.provider', value: 'anthropic', type: 'string', description: null, encryptedValue: null, hint: null, createdAt: new Date('2026-06-04T01:00:00Z'), createdBy: null },
    ]
    const db = { configEntry: { findMany: vi.fn(async () => rows) } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    const result = await svc.history('ai.provider')
    expect(result).toHaveLength(2)
    expect(result[0]?.value).toBe('ollama')
    expect(result[1]?.value).toBe('anthropic')
  })

  it('returns empty array when no history exists', async () => {
    const db = { configEntry: { findMany: vi.fn(async () => []) } }
    const cache = { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() }
    const svc = new ConfigService(db as never, cache as never, TEST_SECRET)

    expect(await svc.history('missing.key')).toEqual([])
  })
})
