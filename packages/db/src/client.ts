import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

function createPrismaClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
  const pool = new pg.Pool({ connectionString });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any);
  return new PrismaClient({ adapter, log: ['error', 'warn'] });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { PrismaClient } from '@prisma/client';
export { withTenantScope } from './extensions/tenant.js';
