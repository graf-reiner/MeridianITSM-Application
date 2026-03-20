import { defineConfig } from 'prisma/config';
import path from 'node:path';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://meridian:meridian@localhost:5432/meridian';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: connectionString,
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const { default: pg } = await import('pg');
      const pool = new pg.Pool({ connectionString });
      return new PrismaPg(pool);
    },
  },
});
