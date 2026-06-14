import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Load .env relative to this file so `prisma migrate deploy` works when invoked
// from the workspace root (where process.cwd() != packages/db).
config({ path: resolve(fileURLToPath(import.meta.url), '..', '.env') })
import { defineConfig } from 'prisma/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
  migrate: {
    async adapter(env) {
      const pool = new Pool({ connectionString: env['DATABASE_URL'] as string })
      return new PrismaPg(pool)
    },
  },
})
