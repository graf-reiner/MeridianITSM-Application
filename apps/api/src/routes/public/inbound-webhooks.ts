// ─── Public POST /api/v1/external/inbound/:token ────────────────────────────
// Anonymous endpoint. Token in URL is the tenant resolver. Validates the
// payload, persists the delivery row (audit + queued payload), enqueues the
// processing job, returns 202 Accepted with a delivery id. The worker
// process actually creates the ticket — keeps this endpoint fast (<50ms p95).

import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { prisma } from '@meridian/db';
import {
  hashToken,
  checkIdempotency,
  sanitizeHeaders,
} from '../../services/inbound-webhook.service.js';

const QUEUE_NAME = 'inbound-webhook-process';

function makeBullmqConnection() {
  return {
    host: (() => {
      try { return new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname; }
      catch { return 'localhost'; }
    })(),
    port: (() => {
      try { return Number(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port) || 6379; }
      catch { return 6379; }
    })(),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}

const inboundWebhookQueue = new Queue(QUEUE_NAME, {
  connection: makeBullmqConnection(),
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
  },
});

const MAX_BODY_BYTES = 256 * 1024; // 256 KB

export async function inboundWebhookPublicRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/external/inbound/:token',
    {
      bodyLimit: MAX_BODY_BYTES,
      schema: {
        params: {
          type: 'object',
          properties: { token: { type: 'string', minLength: 8, maxLength: 128 } },
          required: ['token'],
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };

      // Resolve token → webhook + tenant.
      const tokenHash = hashToken(token);
      const webhook = await prisma.inboundWebhook.findFirst({
        where: {
          tokenHash,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          tenant: { status: 'ACTIVE' },
        },
        select: { id: true, tenantId: true },
      });

      if (!webhook) {
        // Don't persist — unauthenticated request floods would fill the table.
        // (Future: gate persistence behind a Redis counter.)
        return reply.code(401).send({ error: 'Webhook not found, disabled, or expired' });
      }

      // Body shape — Fastify already JSON-parsed it (or rejected with 400).
      const body = request.body;
      if (body === undefined || body === null || typeof body !== 'object') {
        return persistAndReply(reply, webhook, request, body, 'REJECTED_VALIDATION', 400, 'Body must be a non-empty JSON object');
      }

      // Idempotency — optional X-Idempotency-Key header.
      const idemKey = (request.headers['x-idempotency-key'] as string | undefined) ?? null;
      let cachedDeliveryId: string | undefined;
      if (idemKey) {
        if (idemKey.length > 256) {
          return persistAndReply(reply, webhook, request, body, 'REJECTED_VALIDATION', 400, 'X-Idempotency-Key too long (max 256 chars)');
        }
        // We won't reserve here — the reservation needs the deliveryId.
        // Pre-check only: peek to short-circuit duplicates without writing a row.
        const peek = await checkIdempotencyPeek(webhook.tenantId, webhook.id, idemKey);
        if (peek?.cachedDeliveryId) {
          return reply.code(200).send({
            duplicate: true,
            deliveryId: peek.cachedDeliveryId,
            ticketId: peek.cachedTicketId ?? null,
            ticketNumber: peek.cachedTicketNumber ?? null,
          });
        }
      }

      // Persist PENDING delivery — body lives here so the worker can replay
      // even if Redis is down.
      const sourceIp = (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        ?? request.ip;
      const headers = sanitizeHeaders(request.headers);
      const bodyStr = JSON.stringify(body);
      const bodySize = Buffer.byteLength(bodyStr, 'utf8');

      const delivery = await prisma.inboundWebhookDelivery.create({
        data: {
          tenantId: webhook.tenantId,
          inboundWebhookId: webhook.id,
          status: 'PENDING',
          httpResponseCode: 202,
          requestHeaders: headers,
          requestBody: body as object,
          requestBodySize: bodySize,
          idempotencyKey: idemKey ?? null,
          sourceIp,
        },
        select: { id: true },
      });

      // Reserve the idempotency key now that we have a deliveryId.
      if (idemKey) {
        const idem = await checkIdempotency(webhook.tenantId, webhook.id, idemKey, delivery.id);
        if (idem.duplicate && idem.cachedDeliveryId && idem.cachedDeliveryId !== delivery.id) {
          // A concurrent caller beat us — mark this delivery DUPLICATE_IDEMPOTENT
          // and return the cached info instead.
          await prisma.inboundWebhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'DUPLICATE_IDEMPOTENT',
              httpResponseCode: 200,
              completedAt: new Date(),
            },
          });
          return reply.code(200).send({
            duplicate: true,
            deliveryId: idem.cachedDeliveryId,
            ticketId: idem.cachedTicketId ?? null,
            ticketNumber: idem.cachedTicketNumber ?? null,
          });
        }
      }

      // Enqueue the worker job — body NOT included; worker reads from the row.
      try {
        await inboundWebhookQueue.add('process', { deliveryId: delivery.id });
      } catch (enqErr) {
        request.log.error({ err: enqErr, deliveryId: delivery.id }, '[inbound-webhook] enqueue failed');
        await prisma.inboundWebhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'ERROR', httpResponseCode: 500, errorMessage: 'enqueue failed', completedAt: new Date() },
        });
        return reply.code(500).send({ error: 'Internal error queueing webhook' });
      }

      // Bump lastUsedAt fire-and-forget (don't block the response).
      void prisma.inboundWebhook.update({
        where: { id: webhook.id },
        data: { lastUsedAt: new Date() },
      }).catch((err) => request.log.warn({ err }, '[inbound-webhook] lastUsedAt update failed'));

      return reply.code(202).send({ deliveryId: delivery.id });
    },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function persistAndReply(
  reply: import('fastify').FastifyReply,
  webhook: { id: string; tenantId: string },
  request: import('fastify').FastifyRequest,
  body: unknown,
  status: 'REJECTED_VALIDATION' | 'REJECTED_TEMPLATE' | 'ERROR',
  httpCode: number,
  errorMessage: string,
): Promise<void> {
  const sourceIp = (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    ?? request.ip;
  const headers = sanitizeHeaders(request.headers);
  const bodyForStore = body && typeof body === 'object' ? (body as object) : null;
  const bodySize = bodyForStore ? Buffer.byteLength(JSON.stringify(bodyForStore), 'utf8') : 0;

  await prisma.inboundWebhookDelivery.create({
    data: {
      tenantId: webhook.tenantId,
      inboundWebhookId: webhook.id,
      status,
      httpResponseCode: httpCode,
      requestHeaders: headers,
      requestBody: bodyForStore,
      requestBodySize: bodySize,
      errorMessage,
      sourceIp,
      completedAt: new Date(),
    },
  }).catch(() => { /* never block the response on audit-log failure */ });

  return reply.code(httpCode).send({ error: errorMessage });
}

/** Look up an existing idempotency key without reserving (for short-circuit). */
async function checkIdempotencyPeek(
  tenantId: string,
  webhookId: string,
  rawKey: string,
): Promise<{ cachedDeliveryId: string; cachedTicketId?: string; cachedTicketNumber?: number } | null> {
  const { redis } = await import('../../lib/redis.js');
  const keyHash = hashToken(rawKey);
  const redisKey = `inbound-webhook:idem:${tenantId}:${webhookId}:${keyHash}`;
  const cached = await redis.get(redisKey).catch(() => null);
  if (!cached) return null;
  const parts = cached.split(':');
  if (parts[0] === 'pending') return { cachedDeliveryId: parts[1] ?? '' };
  if (parts[0] === 'done') {
    return {
      cachedDeliveryId: parts[1] ?? '',
      cachedTicketId: parts[2] ?? undefined,
      cachedTicketNumber: parts[3] ? parseInt(parts[3], 10) : undefined,
    };
  }
  return null;
}
