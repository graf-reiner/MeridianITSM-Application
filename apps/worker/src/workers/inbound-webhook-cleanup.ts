// ─── Inbound Webhook Cleanup Worker ──────────────────────────────────────────
// Daily cron — deletes InboundWebhookDelivery rows older than 30 days.
// Mirrors webhook-cleanup.ts exactly (same retention, scheduled 1 hour later
// at 04:00 UTC so the two cleanup jobs don't compete on disk I/O).

import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

export const inboundWebhookCleanupWorker = new Worker(
  QUEUE_NAMES.INBOUND_WEBHOOK_CLEANUP,
  async (job) => {
    console.log(`[inbound-webhook-cleanup] Running delivery history cleanup (job ${job.id})`);
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.inboundWebhookDelivery.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });
    console.log(
      `[inbound-webhook-cleanup] Deleted ${result.count} delivery records older than 30 days (cutoff: ${cutoffDate.toISOString()})`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

inboundWebhookCleanupWorker.on('failed', (job, err) => {
  console.error(`[inbound-webhook-cleanup] Job ${job?.id} failed: ${err.message}`);
});
