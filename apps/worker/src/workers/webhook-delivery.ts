import { Worker } from 'bullmq';
import { createHmac } from 'node:crypto';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── Webhook Delivery Worker ──────────────────────────────────────────────────
//
// Delivers webhook payloads to registered URLs with HMAC-SHA256 signing.
// Custom backoff: 1m, 5m, 30m, 2h, 12h (5 attempts total).
// Auto-disables webhook after 50 consecutive failures.
// Records each delivery attempt in WebhookDelivery table.

export interface WebhookDeliveryJobData {
  tenantId: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
}

const BACKOFF_DELAYS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]; // 1m, 5m, 30m, 2h, 12h

export const webhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
  QUEUE_NAMES.WEBHOOK_DELIVERY,
  async (job) => {
    const { tenantId, webhookId, event, payload } = job.data;

    // Find webhook — must be active and belong to tenant
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, tenantId, isActive: true },
    });

    if (!webhook) {
      // Webhook deleted or disabled since job was enqueued — skip silently
      return;
    }

    // Build JSON body
    const body = JSON.stringify({
      event,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    // Compute HMAC-SHA256 signature if secret is set
    let signature: string | undefined;
    if (webhook.secret) {
      signature = `sha256=${createHmac('sha256', webhook.secret).update(body).digest('hex')}`;
    }

    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Meridian-Event': event,
    };
    if (signature) {
      headers['X-Meridian-Signature'] = signature;
    }

    // Deliver
    const startMs = Date.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      responseStatus = response.status;
      const rawBody = await response.text().catch(() => '');
      responseBody = rawBody.slice(0, 1000); // Limit stored response to 1000 chars
      success = response.status >= 200 && response.status < 300;
    } catch (err) {
      // Network error or timeout
      const message = err instanceof Error ? err.message : String(err);
      responseBody = message.slice(0, 1000);
    }

    const _elapsed = Date.now() - startMs;
    const attemptCount = (job.attemptsMade ?? 0) + 1;

    // Record delivery attempt
    await prisma.webhookDelivery.create({
      data: {
        tenantId,
        webhookId,
        event,
        payload: payload as never,
        responseStatus,
        responseBody,
        attemptCount,
        success,
        deliveredAt: success ? new Date() : null,
      },
    });

    if (success) {
      // Reset consecutive failure counter on success
      await prisma.webhook.update({
        where: { id: webhookId },
        data: { consecutiveFailures: 0 },
      });
    } else {
      // Increment consecutive failure counter
      const updated = await prisma.webhook.update({
        where: { id: webhookId },
        data: { consecutiveFailures: { increment: 1 } },
        select: { consecutiveFailures: true },
      });

      // Auto-disable webhook after 50 consecutive failures
      if (updated.consecutiveFailures >= 50) {
        await prisma.webhook.update({
          where: { id: webhookId },
          data: { isActive: false },
        });
        console.warn(
          `[webhook-delivery] Webhook ${webhookId} auto-disabled after ${updated.consecutiveFailures} consecutive failures`,
        );
      }

      // Throw to trigger BullMQ retry with backoff
      throw new Error(
        `Webhook delivery failed (status=${responseStatus ?? 'network error'}, attempt=${attemptCount})`,
      );
    }
  },
  {
    connection: bullmqConnection,
    concurrency: 5,
    settings: {
      backoffStrategy: (attemptsMade: number) => BACKOFF_DELAYS[attemptsMade - 1] ?? 43_200_000,
    },
  },
);

webhookDeliveryWorker.on('failed', (job, err) => {
  console.error(`[webhook-delivery] Job ${job?.id} failed (attempt ${job?.attemptsMade ?? 0}): ${err.message}`);
});
