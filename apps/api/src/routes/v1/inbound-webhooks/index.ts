// ─── /api/v1/inbound-webhooks/* ─────────────────────────────────────────────
// Admin CRUD for managing inbound webhook configurations. Mirrors the outbound
// webhook routes (apps/api/src/routes/v1/webhooks/index.ts) — same RBAC,
// same "secret returned once" pattern.

import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { requirePermission } from '../../../plugins/rbac.js';
import {
  applyMapping,
  generateRawToken,
  hashToken,
} from '../../../services/inbound-webhook.service.js';

function buildWebhookUrl(token: string): string {
  const base = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return `${base.replace(/\/+$/, '')}/api/v1/external/inbound/${token}`;
}

export async function inboundWebhookRoutes(app: FastifyInstance): Promise<void> {

  // ─── POST /api/v1/inbound-webhooks ─────────────────────────────────────────
  // Returns raw token + URL ONCE; only the hash is stored.

  app.post(
    '/api/v1/inbound-webhooks',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const body = request.body as {
        name?: string;
        description?: string;
        defaultQueueId?: string;
        defaultCategoryId?: string;
        defaultPriority?: string;
        defaultType?: string;
        defaultRequesterId?: string;
        mapping?: Record<string, unknown>;
      };

      if (!body.name || typeof body.name !== 'string') {
        return reply.code(400).send({ error: 'name is required' });
      }

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);

      const webhook = await prisma.inboundWebhook.create({
        data: {
          tenantId,
          name: body.name,
          description: body.description ?? null,
          tokenHash,
          defaultQueueId: body.defaultQueueId ?? null,
          defaultCategoryId: body.defaultCategoryId ?? null,
          defaultPriority: (body.defaultPriority as never) ?? null,
          defaultType: (body.defaultType as never) ?? null,
          defaultRequesterId: body.defaultRequesterId ?? null,
          mapping: body.mapping ?? {},
          isActive: true,
        },
      });

      const { tokenHash: _omit, ...rest } = webhook;
      return reply.code(201).send({
        ...rest,
        token: rawToken,        // shown ONCE — caller must save it
        url: buildWebhookUrl(rawToken),
      });
    },
  );

  // ─── GET /api/v1/inbound-webhooks ──────────────────────────────────────────

  app.get(
    '/api/v1/inbound-webhooks',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;

      const webhooks = await prisma.inboundWebhook.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          consecutiveFailures: true,
          lastUsedAt: true,
          expiresAt: true,
          defaultQueueId: true,
          defaultCategoryId: true,
          defaultPriority: true,
          defaultType: true,
          defaultRequesterId: true,
          mapping: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { deliveries: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send(webhooks);
    },
  );

  // ─── GET /api/v1/inbound-webhooks/:id ──────────────────────────────────────

  app.get(
    '/api/v1/inbound-webhooks/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const webhook = await prisma.inboundWebhook.findFirst({
        where: { id, tenantId },
        include: {
          deliveries: {
            orderBy: { receivedAt: 'desc' },
            take: 50,
            select: {
              id: true, receivedAt: true, status: true, httpResponseCode: true,
              requestBodySize: true, mappedFields: true, createdTicketId: true,
              errorMessage: true, sourceIp: true, completedAt: true,
            },
          },
        },
      });
      if (!webhook) return reply.code(404).send({ error: 'Inbound webhook not found' });

      const { tokenHash: _omit, ...rest } = webhook;
      return reply.send(rest);
    },
  );

  // ─── PATCH /api/v1/inbound-webhooks/:id ────────────────────────────────────

  app.patch(
    '/api/v1/inbound-webhooks/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const body = request.body as {
        name?: string;
        description?: string | null;
        defaultQueueId?: string | null;
        defaultCategoryId?: string | null;
        defaultPriority?: string | null;
        defaultType?: string | null;
        defaultRequesterId?: string | null;
        mapping?: Record<string, unknown>;
        isActive?: boolean;
        expiresAt?: string | null;
      };

      const existing = await prisma.inboundWebhook.findFirst({ where: { id, tenantId } });
      if (!existing) return reply.code(404).send({ error: 'Inbound webhook not found' });

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.defaultQueueId !== undefined) updateData.defaultQueueId = body.defaultQueueId;
      if (body.defaultCategoryId !== undefined) updateData.defaultCategoryId = body.defaultCategoryId;
      if (body.defaultPriority !== undefined) updateData.defaultPriority = body.defaultPriority;
      if (body.defaultType !== undefined) updateData.defaultType = body.defaultType;
      if (body.defaultRequesterId !== undefined) updateData.defaultRequesterId = body.defaultRequesterId;
      if (body.mapping !== undefined) updateData.mapping = body.mapping;
      if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (body.isActive !== undefined) {
        updateData.isActive = body.isActive;
        if (body.isActive === true && !existing.isActive) updateData.consecutiveFailures = 0;
      }

      const updated = await prisma.inboundWebhook.update({
        where: { id },
        data: updateData,
      });
      const { tokenHash: _omit, ...rest } = updated;
      return reply.send(rest);
    },
  );

  // ─── DELETE /api/v1/inbound-webhooks/:id ───────────────────────────────────

  app.delete(
    '/api/v1/inbound-webhooks/:id',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const existing = await prisma.inboundWebhook.findFirst({ where: { id, tenantId } });
      if (!existing) return reply.code(404).send({ error: 'Inbound webhook not found' });

      // Cascade delete handles deliveries (FK is onDelete: Cascade).
      await prisma.inboundWebhook.delete({ where: { id } });
      return reply.send({ ok: true });
    },
  );

  // ─── POST /api/v1/inbound-webhooks/:id/rotate-token ────────────────────────
  // Generates a fresh token and invalidates the old one. Returns raw token ONCE.

  app.post(
    '/api/v1/inbound-webhooks/:id/rotate-token',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };

      const existing = await prisma.inboundWebhook.findFirst({ where: { id, tenantId } });
      if (!existing) return reply.code(404).send({ error: 'Inbound webhook not found' });

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      await prisma.inboundWebhook.update({
        where: { id },
        data: { tokenHash, consecutiveFailures: 0 },
      });

      return reply.send({ token: rawToken, url: buildWebhookUrl(rawToken) });
    },
  );

  // ─── POST /api/v1/inbound-webhooks/:id/preview-mapping ─────────────────────
  // Renders the webhook's mapping templates against a sample payload without
  // writing anything to the DB or queue. Used by the mapping-editor UI.

  app.post(
    '/api/v1/inbound-webhooks/:id/preview-mapping',
    { preHandler: [requirePermission('settings:update')] },
    async (request, reply) => {
      const user = request.user as { tenantId: string };
      const { tenantId } = user;
      const { id } = request.params as { id: string };
      const body = request.body as { samplePayload?: unknown; mappingOverride?: Record<string, unknown> };

      const webhook = await prisma.inboundWebhook.findFirst({ where: { id, tenantId } });
      if (!webhook) return reply.code(404).send({ error: 'Inbound webhook not found' });

      // Allow caller to preview an UNSAVED mapping by passing mappingOverride.
      const effective = body.mappingOverride
        ? { ...webhook, mapping: body.mappingOverride }
        : webhook;

      try {
        const result = await applyMapping(
          effective,
          body.samplePayload ?? {},
          { 'user-agent': 'preview-mapping' },
        );
        return reply.send({ ok: true, mapped: result.mappedFields, ticketInput: result.data });
      } catch (err) {
        return reply.code(422).send({
          ok: false,
          error: err instanceof Error ? err.message : 'Mapping failed',
        });
      }
    },
  );
}
