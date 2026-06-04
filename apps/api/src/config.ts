import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3003),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  MEILISEARCH_HOST: z.string().url().default('http://localhost:7700'),
  MEILISEARCH_API_KEY: z.string(),
  VALKEY_URL: z.string().default('redis://localhost:6379'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_REQUIRED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:3002,http://localhost:3000').transform(v =>
    v.includes(',') ? v.split(',').map(s => s.trim()) : v
  ),
  // 32-byte hex string — required for secret config entries (AES-256-GCM encryption)
  CONFIG_ENCRYPTION_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'CONFIG_ENCRYPTION_SECRET must be a 64-character hex string (32 bytes)')
    .optional(),
})

export type Config = z.infer<typeof schema>

export function loadConfig(): Config {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration. Missing or invalid: ${missing}`)
  }
  return result.data
}
