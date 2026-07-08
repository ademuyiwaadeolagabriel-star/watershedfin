import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Q3 FIX: Only log queries in development, never in production
const isDev = process.env.NODE_ENV !== 'production';

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'error', 'warn'] : ['error'],
  })

// Prevent multiple instances in development (hot reload)
if (isDev) globalForPrisma.prisma = db
