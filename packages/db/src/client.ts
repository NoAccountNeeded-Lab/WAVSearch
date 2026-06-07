import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

let prisma: PrismaClient | undefined

export function getDb(): PrismaClient {
  if (!prisma) {
    const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
    const adapter = new PrismaPg(pool)
    prisma = new PrismaClient({
      adapter,
      log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
    })
  }
  return prisma
}

export async function disconnectDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = undefined
  }
}
