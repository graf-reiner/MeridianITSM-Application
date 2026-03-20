import type { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { redis } from '../lib/redis.js';

export const AUTH_RATE_LIMIT = { max: 5, timeWindow: '15 minutes' };
export const API_RATE_LIMIT = { max: 100, timeWindow: '1 minute' };
export const API_READ_RATE_LIMIT = { max: 300, timeWindow: '1 minute' };
export const API_WRITE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };
export const EXPENSIVE_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    redis,
    max: API_RATE_LIMIT.max,
    timeWindow: API_RATE_LIMIT.timeWindow,
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    }),
  });
}
