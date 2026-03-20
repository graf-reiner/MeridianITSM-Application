import type { FastifyInstance } from 'fastify';
import { redis } from '../../../lib/redis.js';
import { requirePermission } from '../../../plugins/rbac.js';
import { Redis } from 'ioredis';

/**
 * Settings: System Log Viewer Routes (SETT-12)
 *
 * GET /api/v1/settings/logs/recent  — Last 100 log entries from Redis list
 * GET /api/v1/settings/logs/stream  — SSE endpoint streaming worker logs via Redis pub/sub
 */
export async function logsSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/settings/logs/recent — Return last 100 log entries from Redis list
  fastify.get(
    '/api/v1/settings/logs/recent',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      // Workers push to 'worker-logs:recent' with LPUSH + LTRIM(500)
      const entries = await redis.lrange('worker-logs:recent', 0, 99);
      const logs = entries.map((entry) => {
        try {
          return JSON.parse(entry) as unknown;
        } catch {
          return { raw: entry };
        }
      });

      return reply.status(200).send({ logs });
    },
  );

  // GET /api/v1/settings/logs/stream — SSE endpoint for worker log streaming
  fastify.get(
    '/api/v1/settings/logs/stream',
    { preHandler: [requirePermission('settings:read')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const tenantId = user.tenantId;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
      });

      // Create a dedicated subscriber Redis connection
      const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

      const channel = `worker-logs:${tenantId}`;

      // Send initial connection event
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', channel })}\n\n`);

      // Subscribe to tenant-scoped worker log channel
      await subscriber.subscribe(channel);

      subscriber.on('message', (_ch: string, message: string) => {
        if (!reply.raw.destroyed) {
          reply.raw.write(`data: ${message}\n\n`);
        }
      });

      // Keep-alive ping every 15 seconds
      const keepAlive = setInterval(() => {
        if (!reply.raw.destroyed) {
          reply.raw.write(`: keep-alive\n\n`);
        } else {
          clearInterval(keepAlive);
        }
      }, 15000);

      // Cleanup on client disconnect
      request.raw.on('close', () => {
        clearInterval(keepAlive);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      });

      // Keep the connection open — Fastify should not auto-send the reply
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
      });
    },
  );
}
