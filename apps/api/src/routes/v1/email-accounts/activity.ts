// ─── Email Account Activity ──────────────────────────────────────────────────
// GET /api/v1/email-accounts/:id/activity?since=&limit=     - history (default 48h)
// GET /api/v1/email-accounts/:id/activity/stream            - SSE live tail
//
// Both endpoints validate that the email account belongs to the caller's tenant
// before returning any data. The SSE endpoint mirrors the pattern in
// apps/api/src/routes/v1/settings/logs.ts.

import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import { channelFor, serializeForStream } from '../../../services/email-activity.service.js';

const DEFAULT_HISTORY_HOURS = 48;
const MAX_HISTORY_LIMIT = 500;

export async function emailActivityRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /:id/activity — history ────────────────────────────────────────────
  app.get('/api/v1/email-accounts/:id/activity', { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const query = request.query as { since?: string; limit?: string };

    const account = await prisma.emailAccount.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!account) return reply.status(404).send({ error: 'Email account not found' });

    const sinceDate = query.since ? new Date(query.since) : new Date(Date.now() - DEFAULT_HISTORY_HOURS * 60 * 60 * 1000);
    if (Number.isNaN(sinceDate.getTime())) {
      return reply.status(400).send({ error: 'Invalid "since" date' });
    }
    const limitRaw = query.limit ? Number.parseInt(query.limit, 10) : 200;
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200), MAX_HISTORY_LIMIT);

    const rows = await prisma.emailActivityLog.findMany({
      where: { tenantId: user.tenantId, emailAccountId: id, occurredAt: { gte: sinceDate } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return reply.status(200).send({ entries: rows.map(serializeForStream), since: sinceDate.toISOString(), limit });
  });

  // ── GET /:id/activity/stream — SSE live tail ───────────────────────────────
  app.get('/api/v1/email-accounts/:id/activity/stream', { preHandler: [requirePermission('settings:read')] }, async (request, reply) => {
    const user = request.user as { tenantId: string };
    const { id } = request.params as { id: string };

    const account = await prisma.emailAccount.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!account) return reply.status(404).send({ error: 'Email account not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    const channel = channelFor(user.tenantId, id);
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', channel })}\n\n`);

    await subscriber.subscribe(channel);
    subscriber.on('message', (_ch: string, message: string) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    });

    const keepAlive = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`: keep-alive\n\n`);
      } else {
        clearInterval(keepAlive);
      }
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.quit().catch(() => {});
    });

    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
    });
  });
}
