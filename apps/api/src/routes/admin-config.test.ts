import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminConfigRoutes } from './admin-config.js'
import { encryptSecret } from '../services/config-service.js'

// 32-byte hex key for tests
const TEST_SECRET = 'a'.repeat(64)

function buildTestApp(db: unknown, encryptionSecret: string | undefined = TEST_SECRET) {
  const app = Fastify()
  void app.register(sensible)
  const cache = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  }
  void app.register(adminConfigRoutes, {
    db: db as never,
    cache: cache as never,
    encryptionSecret,
  })
  return { app, cache }
}

const NOW = new Date('2026-06-04T00:00:00Z')

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cuid123',
    key: 'ai.intake.provider',
    value: 'anthropic',
    type: 'string',
    description: 'Active AI provider',
    encryptedValue: null,
    hint: null,
    createdAt: NOW,
    createdBy: null,
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /admin/config', () => {
  it('returns all current config values', async () => {
    const row = makeRow()
    const db = {
      $queryRaw: vi.fn(async () => [row]),
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: typeof row[] }>()
    expect(body.data).toHaveLength(1)
    const first = body.data[0]
    expect(first?.key).toBe('ai.intake.provider')
    expect(first?.value).toBe('anthropic')

    await app.close()
  })
})

describe('GET /admin/config/:key', () => {
  it('returns the current value for a key', async () => {
    const row = makeRow()
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => row),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/ai.intake.provider' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: typeof row }>()
    expect(body.data.key).toBe('ai.intake.provider')
    expect(body.data.value).toBe('anthropic')

    await app.close()
  })

  it('returns 404 when key does not exist', async () => {
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => null),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/nonexistent.key' })
    expect(res.statusCode).toBe(404)

    await app.close()
  })

  it('returns 404 when the latest row is a tombstone (soft-deleted)', async () => {
    const tombstone = makeRow({ value: null, type: 'string' })
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => tombstone),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/ai.intake.provider' })
    expect(res.statusCode).toBe(404)

    await app.close()
  })

  it('returns 404 when the latest secret row is a tombstone (hint is null)', async () => {
    const secretTombstone = makeRow({ value: null, type: 'secret', hint: null, encryptedValue: null })
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => secretTombstone),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/secret.anthropic.default' })
    expect(res.statusCode).toBe(404)

    await app.close()
  })

  it('returns 400 for a key with unsafe characters', async () => {
    const { app } = buildTestApp({})

    const res = await app.inject({ method: 'GET', url: '/key with spaces' })
    expect(res.statusCode).toBe(400)

    await app.close()
  })
})

describe('PUT /admin/config/:key', () => {
  it('inserts a new string config entry', async () => {
    const row = makeRow()
    const db = {
      configEntry: {
        create: vi.fn(async () => row),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({
      method: 'PUT',
      url: '/ai.intake.provider',
      payload: { value: 'anthropic', type: 'string', description: 'Active AI provider' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ data: typeof row }>()
    expect(body.data.key).toBe('ai.intake.provider')
    expect(db.configEntry.create).toHaveBeenCalledOnce()

    await app.close()
  })

  it('rejects an invalid type', async () => {
    const { app } = buildTestApp({})

    const res = await app.inject({
      method: 'PUT',
      url: '/ai.intake.provider',
      payload: { value: 'x', type: 'invalid-type' },
    })

    expect(res.statusCode).toBe(400)

    await app.close()
  })

  it('rejects a non-numeric string for number type', async () => {
    const { app } = buildTestApp({})

    const res = await app.inject({
      method: 'PUT',
      url: '/some.count',
      payload: { value: 'not-a-number', type: 'number' },
    })

    expect(res.statusCode).toBe(400)

    await app.close()
  })

  it('rejects a key with unsafe characters', async () => {
    const { app } = buildTestApp({})

    const res = await app.inject({
      method: 'PUT',
      url: '/key with spaces',
      payload: { value: 'x', type: 'string' },
    })

    expect(res.statusCode).toBe(400)

    await app.close()
  })

  it('encrypts secrets and stores hint only', async () => {
    const secretValue = 'sk-ant-api-test-key-1234'
    const hint = secretValue.slice(-4) // '1234'
    const row = makeRow({
      key: 'secret.anthropic.default',
      value: null,
      type: 'secret',
      hint,
      encryptedValue: 'some-encrypted-blob',
    })
    const db = {
      configEntry: {
        create: vi.fn(async () => row),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({
      method: 'PUT',
      url: '/secret.anthropic.default',
      payload: { value: secretValue, type: 'secret' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ data: typeof row }>()
    // hint is exposed, not the plaintext value
    expect(body.data.hint).toBe(hint)
    expect(body.data.value).toBeNull()

    // Ensure the create call used encryption
    const calls = (db.configEntry.create.mock.calls as unknown) as Array<[{ data: Record<string, unknown> }]>
    const createArg = calls[0]![0]!.data
    expect(createArg['encryptedValue']).toBeDefined()
    expect(createArg['encryptedValue']).not.toBe(secretValue)
    // Plaintext must not be stored — Prisma.JsonNull sentinel or null is fine
    expect(createArg['value']).not.toBe(secretValue)

    await app.close()
  })

  it('returns 500 when secret is requested but no encryption secret is configured', async () => {
    const { app } = buildTestApp({}, undefined)

    const res = await app.inject({
      method: 'PUT',
      url: '/secret.anthropic.default',
      payload: { value: 'sk-test', type: 'secret' },
    })

    expect(res.statusCode).toBe(500)

    await app.close()
  })

  it('inserts a boolean config entry', async () => {
    const row = makeRow({ key: 'feature.flag', value: true, type: 'boolean' })
    const db = {
      configEntry: {
        create: vi.fn(async () => row),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({
      method: 'PUT',
      url: '/feature.flag',
      payload: { value: true, type: 'boolean' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ data: typeof row }>()
    expect(body.data.value).toBe(true)

    await app.close()
  })

  it('returns 400 when value is missing for a non-secret type', async () => {
    const { app } = buildTestApp({})

    const res = await app.inject({
      method: 'PUT',
      url: '/ai.intake.provider',
      payload: { value: null, type: 'string' },
    })

    expect(res.statusCode).toBe(400)

    await app.close()
  })
})

describe('GET /admin/config/:key/history', () => {
  it('returns all historical rows for a key', async () => {
    const rows = [
      makeRow({ id: 'c2', value: 'ollama', createdAt: new Date('2026-06-04T01:00:00Z') }),
      makeRow({ id: 'c1', value: 'anthropic', createdAt: NOW }),
    ]
    const db = {
      configEntry: {
        findMany: vi.fn(async () => rows),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/ai.intake.provider/history' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: unknown[] }>()
    expect(body.data).toHaveLength(2)

    await app.close()
  })

  it('returns 404 when no history exists for a key', async () => {
    const db = {
      configEntry: {
        findMany: vi.fn(async () => []),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'GET', url: '/nonexistent.key/history' })
    expect(res.statusCode).toBe(404)

    await app.close()
  })
})

describe('DELETE /admin/config/:key', () => {
  it('inserts a tombstone row', async () => {
    const row = makeRow()
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => row),
        create: vi.fn(async () => ({ ...row, value: null })),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'DELETE', url: '/ai.intake.provider' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ data: { deleted: boolean } }>()
    expect(body.data.deleted).toBe(true)
    expect(db.configEntry.create).toHaveBeenCalledOnce()

    await app.close()
  })

  it('returns 404 when deleting a non-existent key', async () => {
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => null),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'DELETE', url: '/nonexistent.key' })
    expect(res.statusCode).toBe(404)

    await app.close()
  })

  it('returns 400 for a key with unsafe characters', async () => {
    const { app } = buildTestApp({})

    const res = await app.inject({ method: 'DELETE', url: '/key with spaces' })
    expect(res.statusCode).toBe(400)

    await app.close()
  })

  it('returns 404 when deleting an already-tombstoned key', async () => {
    // A tombstone: value is null for a non-secret type
    const tombstone = makeRow({ value: null, type: 'string' })
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => tombstone),
        create: vi.fn(),
      },
    }
    const { app } = buildTestApp(db)

    const res = await app.inject({ method: 'DELETE', url: '/ai.intake.provider' })
    expect(res.statusCode).toBe(404)
    expect(db.configEntry.create).not.toHaveBeenCalled()

    await app.close()
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret value', async () => {
    const { decryptSecret } = await import('../services/config-service.js')
    const plainText = 'sk-ant-api-test-key-super-secret'
    const encrypted = encryptSecret(plainText, TEST_SECRET)
    const decrypted = decryptSecret(encrypted, TEST_SECRET)
    expect(decrypted).toBe(plainText)
  })
})

describe('Valkey cache integration', () => {
  it('populates cache on cache miss', async () => {
    const row = makeRow()
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => row),
      },
    }
    const { app, cache } = buildTestApp(db)

    await app.inject({ method: 'GET', url: '/ai.intake.provider' })

    expect(cache.set).toHaveBeenCalledWith(
      'config:ai.intake.provider',
      expect.any(String),
      'EX',
      60,
    )

    await app.close()
  })

  it('returns cached value without hitting DB', async () => {
    const row = makeRow()
    const db = {
      configEntry: {
        findFirst: vi.fn(async () => row),
      },
    }
    const { app, cache } = buildTestApp(db)
    // Pre-populate cache
    ;(cache.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(row))

    await app.inject({ method: 'GET', url: '/ai.intake.provider' })

    expect(db.configEntry.findFirst).not.toHaveBeenCalled()

    await app.close()
  })
})
