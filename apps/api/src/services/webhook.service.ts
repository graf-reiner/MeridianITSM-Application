import { Queue } from 'bullmq';
import { prisma } from '@meridian/db';

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
 * Dispatch webhooks for an event.
 *
 * Fire-and-forget pattern: finds all active webhooks for the tenant
 * subscribed to the event and enqueues a delivery job for each.
 * Errors are caught and logged — dispatch failure never blocks the caller.
 *
 * @param tenantId   Tenant scope
 * @param event      WebhookEventType value (e.g. 'TICKET_CREATED')
 * @param payload    Event payload to deliver
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: event as never },
      },
      select: { id: true },
    });

    if (webhooks.length === 0) return;

    for (const webhook of webhooks) {
      await webhookDeliveryQueue.add(
        'deliver',
        {
          tenantId,
          webhookId: webhook.id,
          event,
          payload,
        },
        {
          attempts: 5,
          backoff: { type: 'custom' },
        },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhook.service] dispatchWebhooks error (tenantId=${tenantId}, event=${event}): ${message}`);
    // Never propagate — fire-and-forget
  }
}
