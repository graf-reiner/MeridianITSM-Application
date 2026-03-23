import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { Queue } from 'bullmq';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';

// ─── BullMQ Queue (webhook-delivery) ─────────────────────────────────────────
// Uses the same host/port extraction pattern as notification.service.ts
// to avoid cross-app imports from apps/worker.

const webhookDeliveryQueue = new Queue('webhook-delivery', {
  connection: {
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
  },
});

/**
 * Webhook Management Routes (INTG-03, INTG-04, INTG-05)
 *
 * JWT-protected, admin-only routes for managing outbound webhooks.
 * Webhooks are HMAC-SHA256 signed on delivery; secret is only returned at creation.
 *
 * POST   /api/v1/webhooks         — Create webhook (returns secret once)
 * GET    /api/v1/webhooks         — List webhooks (no secret)
 * GET    /api/v1/webhooks/:id     — Get single webhook with last 50 deliveries
 * PATCH  /api/v1/webhooks/:id     — Update webhook (re-enabling resets consecutiveFailures)
 * DELETE /api/v1/webhooks/:id     — Delete webhook and cascade deliveries
 * POST   /api/v1/webhooks/:id/test — Enqueue test delivery event
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // ─── POST /api/v1/webhooks ────────────────────────────────────────────────

  app.post(
    '/api/v1/webhooks',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const body = request.body as {
        name?: string;
        url?: string;
        events?: string[];
        secret?: string;
      };

      if (!body.name) {
        return reply.code(400).send({ error: 'name is required' });
      }
      if (!body.url) {
        return reply.code(400).send({ error: 'url is required' });
      }
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return reply.code(400).send({ error: 'events is required and must be a non-empty array' });
      }

      // Generate secret if not provided — only shown once at creation
      const secret = body.secret ?? randomBytes(32).toString('hex');

      const webhook = await prisma.webhook.create({
        data: {
          tenantId,
          name: body.name,
          url: body.url,
          events: body.events as never[],
          secret,
          isActive: true,
        },
      });

      return reply.code(201).send({ ...webhook, secret });
    },
  );

  // ─── GET /api/v1/webhooks ─────────────────────────────────────────────────

  app.get(
    '/api/v1/webhooks',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const webhooks = await prisma.webhook.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          isActive: true,
          consecutiveFailures: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send(webhooks);
    },
  );

  // ─── GET /api/v1/webhooks/:id ─────────────────────────────────────────────

  app.get(
    '/api/v1/webhooks/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const webhook = await prisma.webhook.findFirst({
        where: { id, tenantId },
        include: {
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      });

      if (!webhook) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      // Strip secret from response
      const { secret: _secret, ...webhookWithoutSecret } = webhook;
      return reply.send(webhookWithoutSecret);
    },
  );

  // ─── PATCH /api/v1/webhooks/:id ───────────────────────────────────────────

  app.patch(
    '/api/v1/webhooks/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: string;
        url?: string;
        events?: string[];
        isActive?: boolean;
      };

      const existing = await prisma.webhook.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.url !== undefined) updateData.url = body.url;
      if (body.events !== undefined) updateData.events = body.events;
      if (body.isActive !== undefined) {
        updateData.isActive = body.isActive;
        // Re-enabling resets consecutive failure counter
        if (body.isActive === true && !existing.isActive) {
          updateData.consecutiveFailures = 0;
        }
      }

      const webhook = await prisma.webhook.update({
        where: { id },
        data: updateData as never,
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          isActive: true,
          consecutiveFailures: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.send(webhook);
    },
  );

  // ─── DELETE /api/v1/webhooks/:id ──────────────────────────────────────────

  app.delete(
    '/api/v1/webhooks/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const existing = await prisma.webhook.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      // Delete deliveries first (cascade), then the webhook
      await prisma.$transaction([
        prisma.webhookDelivery.deleteMany({ where: { webhookId: id, tenantId } }),
        prisma.webhook.delete({ where: { id } }),
      ]);

      return reply.send({ ok: true });
    },
  );

  // ─── POST /api/v1/webhooks/:id/test ──────────────────────────────────────

  app.post(
    '/api/v1/webhooks/:id/test',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const webhook = await prisma.webhook.findFirst({
        where: { id, tenantId },
      });

      if (!webhook) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      await webhookDeliveryQueue.add(
        'deliver',
        {
          tenantId,
          webhookId: webhook.id,
          event: 'webhook.test',
          payload: { test: true, timestamp: new Date().toISOString() },
        },
        { attempts: 1 }, // Test delivery — no retries
      );

      return reply.send({ status: 'queued' });
    },
  );
}
