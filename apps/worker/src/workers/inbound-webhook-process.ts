// ─── Inbound Webhook Process Worker ──────────────────────────────────────────
// Pulls jobs off the inbound-webhook-process queue. Each job is just a
// deliveryId — the request body lives on the InboundWebhookDelivery row so
// the worker can replay even if Redis is down.
//
// Flow per job:
//   1. Load delivery, skip if status != PENDING (idempotent re-runs).
//   2. Apply the webhook's mapping templates to the request body.
//   3. Create the ticket in a transaction (advisory-locked ticket number).
//   4. Fire dispatchNotificationEvent('TICKET_CREATED') so workflows + rules run.
//   5. Update delivery row status=PROCESSED + createdTicketId.
//   6. Mark idempotency key as completed in Redis if one was supplied.
//
// On error: status=ERROR, increment webhook.consecutiveFailures, BullMQ retries
// with exponential backoff. Auto-disable webhook at 50 consecutive failures
// (mirrors webhook-delivery worker pattern).

import { Worker, type Job } from 'bullmq';
import { prisma } from '@meridian/db';
import { dispatchNotificationEvent, type EventContext } from '@meridian/notifications';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';
import {
  applyMapping,
  hashToken,
  type MappedTicketInput,
} from '../services/inbound-webhook.service.js';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
const AUTO_DISABLE_THRESHOLD = 50;

interface ProcessJobData {
  deliveryId: string;
}

export const inboundWebhookProcessWorker = new Worker<ProcessJobData>(
  QUEUE_NAMES.INBOUND_WEBHOOK_PROCESS,
  async (job: Job<ProcessJobData>) => {
    const { deliveryId } = job.data;
    if (!deliveryId) {
      console.warn('[inbound-webhook-process] Job missing deliveryId, skipping');
      return;
    }

    const delivery = await prisma.inboundWebhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { inboundWebhook: true },
    });

    if (!delivery) {
      console.warn(`[inbound-webhook-process] Delivery ${deliveryId} not found`);
      return;
    }
    if (delivery.status !== 'PENDING') {
      // Idempotent — already processed (or rejected). Don't redo.
      return;
    }
    if (!delivery.inboundWebhook) {
      // Webhook deleted after we enqueued. Mark error and bail.
      await prisma.inboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'ERROR', errorMessage: 'Webhook no longer exists', completedAt: new Date() },
      });
      return;
    }

    const webhook = delivery.inboundWebhook;

    try {
      // 1. Render mapping → ticket input.
      const mapping = await applyMapping(
        webhook,
        delivery.requestBody,
        (delivery.requestHeaders ?? {}) as Record<string, string>,
      );

      // 2. Create the ticket (advisory-locked ticket-number sequence).
      const ticket = await createTicketFromWebhook(webhook.tenantId, mapping.data);

      // 3. Fire TICKET_CREATED so notification rules + workflows react. Same
      //    pattern as email-inbound. Re-fetch with relations the engine needs.
      try {
        const fullTicket = await prisma.ticket.findUnique({
          where: { id: ticket.id },
          include: {
            queue: true,
            assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
            requestedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
            category: true,
          },
        });
        if (fullTicket) {
          await dispatchNotificationEvent(webhook.tenantId, 'TICKET_CREATED', {
            ticket: fullTicket as unknown as EventContext['ticket'],
            actorId: mapping.data.requestedById ?? undefined,
            trigger: 'TICKET_CREATED',
          });
        }
      } catch (dispatchErr) {
        console.error(
          `[inbound-webhook-process] TICKET_CREATED dispatch failed for ticket ${ticket.id}: ${dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr)}`,
        );
      }

      // 4. Mark delivery PROCESSED + reset failure counter on the webhook.
      await prisma.$transaction([
        prisma.inboundWebhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'PROCESSED',
            httpResponseCode: 202, // unchanged — set at receive time
            createdTicketId: ticket.id,
            mappedFields: mapping.mappedFields as object,
            completedAt: new Date(),
          },
        }),
        prisma.inboundWebhook.update({
          where: { id: webhook.id },
          data: { consecutiveFailures: 0, lastUsedAt: new Date() },
        }),
      ]);

      // 5. Mark idempotency key complete in Redis (if one was supplied).
      if (delivery.idempotencyKey) {
        try {
          const { redisConnection } = await import('../queues/connection.js');
          const keyHash = hashToken(delivery.idempotencyKey);
          const redisKey = `inbound-webhook:idem:${webhook.tenantId}:${webhook.id}:${keyHash}`;
          await redisConnection.set(
            redisKey,
            `done:${deliveryId}:${ticket.id}:${ticket.ticketNumber}`,
            'EX',
            86_400,
          );
        } catch (idemErr) {
          console.warn('[inbound-webhook-process] idempotency completion failed (non-fatal):', idemErr);
        }
      }

      console.log(
        `[inbound-webhook-process] delivery=${deliveryId} → ticket #${ticket.ticketNumber} (${ticket.id}) for webhook ${webhook.name}`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[inbound-webhook-process] delivery=${deliveryId} failed: ${errMsg}`);

      // Increment consecutive failures + auto-disable if threshold exceeded.
      const updated = await prisma.inboundWebhook.update({
        where: { id: webhook.id },
        data: { consecutiveFailures: { increment: 1 } },
        select: { consecutiveFailures: true },
      }).catch(() => null);

      if (updated && updated.consecutiveFailures >= AUTO_DISABLE_THRESHOLD) {
        await prisma.inboundWebhook.update({
          where: { id: webhook.id },
          data: { isActive: false },
        }).catch(() => { /* ignore */ });
        console.warn(
          `[inbound-webhook-process] Auto-disabled webhook ${webhook.id} after ${AUTO_DISABLE_THRESHOLD} consecutive failures`,
        );
      }

      await prisma.inboundWebhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'ERROR', errorMessage: errMsg.slice(0, 500), completedAt: new Date() },
      }).catch(() => { /* don't mask the original error */ });

      // Re-throw so BullMQ records the failure and applies backoff.
      throw err;
    }
  },
  {
    connection: bullmqConnection,
    concurrency: 10,
  },
);

inboundWebhookProcessWorker.on('failed', (job, err) => {
  console.error(`[inbound-webhook-process] Job ${job?.id} failed: ${err.message}`);
});

// ─── Ticket creation (worker-local, mirrors email-inbound's pattern) ─────────
// Cross-app imports from apps/api are forbidden, so this re-implements the
// minimum subset of createTicket() needed: atomic ticket-number sequence,
// optional auto-assignment, and the field set inbound webhooks use. It does
// NOT re-implement SLA assignment or ITIL impact×urgency calculation — those
// can be layered on later if customers ask for them.

async function createTicketFromWebhook(
  tenantId: string,
  data: MappedTicketInput,
): Promise<{ id: string; ticketNumber: number; assignedToId: string | null }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId} || '_ticket_seq'))`;
    const seq = await tx.$queryRaw<[{ next: bigint }]>`
      SELECT COALESCE(MAX("ticketNumber"), 0) + 1 AS next
      FROM tickets
      WHERE "tenantId" = ${tenantId}::uuid
    `;
    const ticketNumber = Number(seq[0]!.next);

    let assignedToId: string | null = null;
    if (data.queueId) {
      const queue = await tx.queue.findFirst({
        where: { id: data.queueId, tenantId },
        select: { autoAssign: true, defaultAssigneeId: true },
      });
      if (queue?.autoAssign && queue.defaultAssigneeId) {
        assignedToId = queue.defaultAssigneeId;
      }
    }

    return tx.ticket.create({
      data: {
        tenantId,
        ticketNumber,
        title: data.title,
        description: data.description ?? '',
        type: (data.type ?? 'INCIDENT') as never,
        priority: (data.priority ?? 'MEDIUM') as never,
        queueId: data.queueId ?? null,
        categoryId: data.categoryId ?? null,
        requestedById: data.requestedById ?? null,
        assignedToId,
        source: 'WEBHOOK' as never,
        customFields: (data.customFields ?? null) as never,
      },
      select: { id: true, ticketNumber: true, assignedToId: true },
    });
  });
}
