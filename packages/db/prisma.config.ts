import { defineConfig } from 'prisma/config';
import path from 'node:path';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { default: pg } = await import('pg');
      const connectionString = process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';
      const pool = new pg.Pool({ connectionString });
      return new PrismaPg(pool);
    },
  },
});
