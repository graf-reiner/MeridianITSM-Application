import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // Required for BullMQ compatibility
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => console.error('Redis error:', err));
