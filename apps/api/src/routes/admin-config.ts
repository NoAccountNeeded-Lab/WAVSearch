import type { FastifyPluginAsync } from 'fastify'
import type { Redis } from 'ioredis'
import type { PrismaClient } from '@wav-search/db'
import { ConfigService } from '../services/config-service.js'
import type { ConfigValueType, ConfigValue } from '../services/config-service.js'

interface AdminConfigPluginOptions {
  db: PrismaClient
  cache: Redis
  encryptionSecret: string | undefined
}

const VALID_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'boolean', 'json', 'secret'])

function validateType(raw: unknown): raw is ConfigValueType {
  return typeof raw === 'string' && VALID_TYPES.has(raw)
}

/** Validate that a config key contains only safe characters (alphanumeric, dots, hyphens, underscores). */
function isValidKey(key: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(key)
}

function parseValue(raw: unknown, type: ConfigValueType): ConfigValue | null {
  if (raw === null || raw === undefined) return null
  switch (type) {
    case 'string':
    case 'secret':
      return typeof raw === 'string' ? raw : String(raw)
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (isNaN(n)) return null
      return n
    }
    case 'boolean':
      return raw === true || raw === 'true'
    case 'json':
      return raw as Record<string, unknown>
    default:
      return null
  }
}

export const adminConfigRoutes: FastifyPluginAsync<AdminConfigPluginOptions> = async (
  app,
  { db, cache, encryptionSecret },
) => {
  const svc = new ConfigService(db, cache, encryptionSecret)

  // GET /admin/config — list all current values
  app.get('/', async (_req, reply) => {
    const entries = await svc.listAll()
    // Never expose encryptedValue or plaintext secrets
    return reply.send({ data: entries })
  })

  // GET /admin/config/:key — get current value for one key
  app.get<{ Params: { key: string } }>('/:key', async (req, reply) => {
    if (!isValidKey(req.params.key)) {
      return reply.badRequest('Config key may only contain alphanumeric characters, dots, hyphens, and underscores')
    }
    const entry = await svc.get(req.params.key)
    // Tombstone rows are treated as not found.
    // Non-secrets: value is null. Secrets: encryptedValue is cleared, so hint is null on tombstones
    // (live secrets always have a hint set by buildHint).
    if (!entry || (entry.value === null && (entry.type !== 'secret' || entry.hint === null))) {
      return reply.notFound(`Config key "${req.params.key}" not found`)
    }
    return reply.send({ data: entry })
  })

  // PUT /admin/config/:key — insert a new row (append-only)
  app.put<{
    Params: { key: string }
    Body: {
      value: unknown
      type: unknown
      description?: string
      createdBy?: string
    }
  }>('/:key', async (req, reply) => {
    if (!isValidKey(req.params.key)) {
      return reply.badRequest('Config key may only contain alphanumeric characters, dots, hyphens, and underscores')
    }
    const { value, type, description, createdBy } = req.body ?? {}

    if (!validateType(type)) {
      return reply.badRequest(
        `Invalid type "${String(type)}". Must be one of: ${[...VALID_TYPES].join(', ')}`
      )
    }

    if (value === null || value === undefined) {
      return reply.badRequest('Value is required')
    }

    const parsed = parseValue(value, type)

    if (parsed === null) {
      return reply.badRequest('Value could not be parsed for the given type')
    }

    if (type === 'secret' && !encryptionSecret) {
      return reply.internalServerError(
        'CONFIG_ENCRYPTION_SECRET is not configured — cannot store secrets'
      )
    }

    const entry = await svc.set({
      key: req.params.key,
      value: parsed,
      type,
      ...(typeof description === 'string' ? { description } : {}),
      ...(typeof createdBy === 'string' ? { createdBy } : {}),
    })

    return reply.code(201).send({ data: entry })
  })

  // GET /admin/config/:key/decrypt — returns the decrypted plaintext for a secret (server-to-server only)
  app.get<{ Params: { key: string } }>('/:key/decrypt', async (req, reply) => {
    if (!isValidKey(req.params.key)) {
      return reply.badRequest('Config key may only contain alphanumeric characters, dots, hyphens, and underscores')
    }
    const value = await svc.getSecret(req.params.key)
    if (value === null) {
      return reply.notFound(`Secret "${req.params.key}" not found or not decryptable`)
    }
    return reply.send({ data: { key: req.params.key, value } })
  })

  // GET /admin/config/:key/history — all historical rows for a key
  app.get<{ Params: { key: string } }>('/:key/history', async (req, reply) => {
    if (!isValidKey(req.params.key)) {
      return reply.badRequest('Config key may only contain alphanumeric characters, dots, hyphens, and underscores')
    }
    const rows = await svc.history(req.params.key)
    if (rows.length === 0) {
      return reply.notFound(`Config key "${req.params.key}" not found`)
    }
    return reply.send({ data: rows })
  })

  // DELETE /admin/config/:key — soft delete (insert tombstone row)
  app.delete<{ Params: { key: string }; Body?: { createdBy?: string } }>(
    '/:key',
    async (req, reply) => {
      if (!isValidKey(req.params.key)) {
        return reply.badRequest('Config key may only contain alphanumeric characters, dots, hyphens, and underscores')
      }
      const createdBy = req.body?.createdBy

      try {
        await svc.delete(req.params.key, typeof createdBy === 'string' ? createdBy : undefined)
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return reply.notFound(err.message)
        }
        throw err
      }

      return reply.send({ data: { deleted: true } })
    }
  )
}
