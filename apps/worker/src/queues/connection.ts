import { Redis } from 'ioredis';

// Active ioredis instance for direct Redis calls in workers (worker-only —
// BullMQ uses its own pool seeded from the host/port options below).
export const redisConnection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('error', (err: Error) => console.error('Worker Redis error:', err));

// Re-exported from @meridian/core so every Queue/Worker construction across
// the monorepo converges on a single source of truth.
export { bullmqConnection } from '@meridian/core';
