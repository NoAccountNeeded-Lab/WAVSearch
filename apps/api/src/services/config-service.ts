import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'
import { Prisma, type PrismaClient } from '@wav-search/db'

export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json' | 'secret'
export type ConfigValue = string | number | boolean | Record<string, unknown>

export interface ConfigRow {
  id: string
  key: string
  /** Null for tombstone (deleted) entries */
  value: ConfigValue | null
  type: ConfigValueType
  description: string | null
  /** Last 4 chars of a secret — never the full value */
  hint: string | null
  createdAt: Date
  createdBy: string | null
}

const CACHE_TTL_SECONDS = 60
const CIPHER_ALGO = 'aes-256-gcm'

function cacheKey(key: string): string {
  return `config:${key}`
}

function parseKeyFromEnv(secret: string): Buffer {
  return Buffer.from(secret, 'hex')
}

/** Encrypt a plain-text secret. Returns `iv:authTag:ciphertext` as hex. */
export function encryptSecret(plainText: string, encryptionSecret: string): string {
  const key = parseKeyFromEnv(encryptionSecret)
  const iv = randomBytes(12)
  const cipher = createCipheriv(CIPHER_ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/** Decrypt a `iv:authTag:ciphertext` hex string. */
export function decryptSecret(encryptedValue: string, encryptionSecret: string): string {
  const key = parseKeyFromEnv(encryptionSecret)
  const parts = encryptedValue.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivHex, authTagHex, cipherHex] = parts as [string, string, string]
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(cipherHex, 'hex')
  const decipher = createDecipheriv(CIPHER_ALGO, key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

function buildHint(value: string): string {
  return value.slice(-4)
}

function mapRow(raw: {
  id: string
  key: string
  value: unknown
  type: string
  description: string | null
  hint: string | null
  createdAt: Date
  createdBy: string | null
}): ConfigRow {
  return {
    id: raw.id,
    key: raw.key,
    value: raw.value as ConfigValue | null,
    type: raw.type as ConfigValueType,
    description: raw.description,
    hint: raw.hint,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
  }
}

export class ConfigService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: Redis,
    private readonly encryptionSecret: string | undefined,
  ) {}

  /**
   * Get the current value for a key.
   * Checks Valkey cache first, falls back to Postgres.
   * For secrets: decrypts the value if the caller explicitly requests it,
   * but the public API must never return raw secrets.
   */
  async get(key: string): Promise<ConfigRow | null> {
    const cached = await this.cache.get(cacheKey(key)).catch(() => null)
    if (cached) {
      try {
        return JSON.parse(cached) as ConfigRow
      } catch {
        // corrupt cache — fall through to DB
      }
    }

    const row = await this.db.configEntry.findFirst({
      where: { key },
      orderBy: { createdAt: 'desc' },
    })

    if (!row) return null

    const mapped = mapRow(row)
    await this.cache
      .set(cacheKey(key), JSON.stringify(mapped), 'EX', CACHE_TTL_SECONDS)
      .catch(() => undefined)

    return mapped
  }

  /**
   * Get the decrypted plaintext for a secret key.
   * Returns null if the key doesn't exist or isn't a secret.
   */
  async getSecret(key: string): Promise<string | null> {
    if (!this.encryptionSecret) return null
    const row = await this.db.configEntry.findFirst({
      where: { key, type: 'secret' },
      orderBy: { createdAt: 'desc' },
    })
    if (!row || row.hint === null) return null // not found or tombstone
    if (!row.encryptedValue) return null
    return decryptSecret(row.encryptedValue, this.encryptionSecret)
  }

  /** List the current value for every key (latest row per key). Secrets show hint only. */
  async listAll(): Promise<ConfigRow[]> {
    // Use a subquery to get the latest createdAt per key, then fetch those rows.
    // Use a CTE so the tombstone filter runs after DISTINCT ON picks the latest row per key.
    // Non-secret tombstones: value IS NULL. Secret tombstones: hint IS NULL (live secrets always have a hint).
    const rows = await this.db.$queryRaw<Array<{
      id: string
      key: string
      value: unknown
      type: string
      description: string | null
      hint: string | null
      createdAt: Date
      createdBy: string | null
    }>>`
      WITH latest AS (
        SELECT DISTINCT ON (key) id, key, value, type, description, hint, "createdAt", "createdBy"
        FROM config_entry
        ORDER BY key, "createdAt" DESC
      )
      SELECT * FROM latest
      WHERE (type != 'secret' AND value IS NOT NULL)
         OR (type = 'secret' AND hint IS NOT NULL)
    `
    return rows.map(mapRow)
  }

  /**
   * Insert a new config entry (append-only).
   * For secrets: encrypts the value and stores only the hint in the public row.
   */
  async set(options: {
    key: string
    value: ConfigValue | null
    type: ConfigValueType
    description?: string
    createdBy?: string
  }): Promise<ConfigRow> {
    const { key, value, type, description, createdBy } = options

    let encryptedValue: string | undefined
    let hint: string | undefined
    let storedValue: ConfigValue | null = value

    if (type === 'secret') {
      if (!this.encryptionSecret) {
        throw new Error('CONFIG_ENCRYPTION_SECRET is required to store secrets')
      }
      if (typeof value !== 'string') {
        throw new Error('Secret value must be a string')
      }
      encryptedValue = encryptSecret(value, this.encryptionSecret)
      hint = buildHint(value)
      storedValue = null // never store plaintext
    }

    const created = await this.db.configEntry.create({
      data: {
        key,
        value: storedValue === null ? Prisma.JsonNull : (storedValue as never),
        type: type as never,
        description: description ?? null,
        encryptedValue: encryptedValue ?? null,
        hint: hint ?? null,
        createdBy: createdBy ?? null,
      },
    })

    // Invalidate cache
    await this.cache.del(cacheKey(key)).catch(() => undefined)

    return mapRow(created)
  }

  /**
   * Soft-delete: inserts a tombstone row with value=null.
   * Invalidates cache.
   */
  async delete(key: string, createdBy?: string): Promise<void> {
    const existing = await this.db.configEntry.findFirst({
      where: { key },
      orderBy: { createdAt: 'desc' },
    })
    const isTombstone = existing
      ? existing.type === 'secret' ? existing.hint === null : existing.value === null
      : false
    if (!existing || isTombstone) throw new Error(`Config key "${key}" not found`)

    await this.db.configEntry.create({
      data: {
        key,
        value: Prisma.JsonNull,
        type: existing.type,
        description: existing.description,
        encryptedValue: null,
        hint: null,
        createdBy: createdBy ?? null,
      },
    })

    await this.cache.del(cacheKey(key)).catch(() => undefined)
  }

  /** Get full history for a key (all rows, newest first). */
  async history(key: string): Promise<ConfigRow[]> {
    const rows = await this.db.configEntry.findMany({
      where: { key },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(mapRow)
  }
}
