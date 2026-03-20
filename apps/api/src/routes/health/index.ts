import type { FastifyInstance, FastifyReply } from 'fastify';
import { redis } from '../../lib/redis.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    redis: 'ok' | 'error';
  };
}

/**
 * Health check routes — no authentication required.
 * Returns 200 if all checks pass, 503 if any check fails.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_request, reply: FastifyReply) => {
    const checks: HealthResponse['checks'] = {
      redis: 'error',
    };

    // Check Redis connectivity
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    const body: HealthResponse = {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      checks,
    };

    return reply.code(allOk ? 200 : 503).send(body);
  });
}
