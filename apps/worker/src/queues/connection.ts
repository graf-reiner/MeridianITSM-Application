import { Redis } from 'ioredis';

// Shared Redis connection for BullMQ workers
// maxRetriesPerRequest: null is required by BullMQ
export const redisConnection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('error', (err: Error) => console.error('Worker Redis error:', err));

// BullMQ connection options (URL-based) to avoid ioredis version conflicts
export const bullmqConnection = {
  host: (() => {
    try {
      return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname;
    } catch {
      return 'localhost';
    }
  })(),
  port: (() => {
    try {
      return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379;
    } catch {
      return 6379;
    }
  })(),
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};
