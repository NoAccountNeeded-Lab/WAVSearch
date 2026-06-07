import 'dotenv/config'
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
