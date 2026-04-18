import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // `src/**/*.test.ts`: unit tests (mocked Prisma — seed / extension helpers)
    // `__tests__/**/*.test.ts`: integration tests (real Postgres — phase8-backfill, etc.)
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    testTimeout: 60000, // integration tests include per-Asset transactions + advisory locks
  },
});
