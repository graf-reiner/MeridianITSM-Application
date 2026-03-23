import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

// ─── Webhook Cleanup Worker ───────────────────────────────────────────────────
//
// Daily cron job: deletes WebhookDelivery records older than 30 days.
// Scheduled via repeatable job in worker index (0 3 * * * — daily at 3:00 AM UTC).
//
// Per CONTEXT.md locked decision: "Last 30 days retained" for delivery history.

export const webhookCleanupWorker = new Worker(
  QUEUE_NAMES.WEBHOOK_CLEANUP,
  async (job) => {
    console.log(`[webhook-cleanup] Running delivery history cleanup (job ${job.id})`);

    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.webhookDelivery.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    console.log(`[webhook-cleanup] Deleted ${result.count} delivery records older than 30 days (cutoff: ${cutoffDate.toISOString()})`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

webhookCleanupWorker.on('failed', (job, err) => {
  console.error(`[webhook-cleanup] Job ${job?.id} failed: ${err.message}`);
});
