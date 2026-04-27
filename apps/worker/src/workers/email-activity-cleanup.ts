// ─── Email Activity Log Retention ────────────────────────────────────────────
// Daily-scheduled BullMQ worker that prunes EmailActivityLog rows older than
// EMAIL_ACTIVITY_RETENTION_DAYS (default 30). Set the env var to 0 to retain
// forever (off).
//
// Scheduled in apps/worker/src/auto-start.ts so it self-registers when the
// worker process boots.

import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';

const QUEUE_NAME = 'email-activity-cleanup';

export const emailActivityCleanupWorker = new Worker(
  QUEUE_NAME,
  async () => {
    const days = Number.parseInt(process.env.EMAIL_ACTIVITY_RETENTION_DAYS ?? '30', 10);
    if (!Number.isFinite(days) || days <= 0) {
      console.log('[email-activity-cleanup] retention disabled (EMAIL_ACTIVITY_RETENTION_DAYS <= 0); skipping');
      return;
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await prisma.emailActivityLog.deleteMany({
      where: { occurredAt: { lt: cutoff } },
    });
    console.log(`[email-activity-cleanup] Pruned ${result.count} rows older than ${days}d (cutoff ${cutoff.toISOString()})`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

emailActivityCleanupWorker.on('failed', (job, err) => {
  console.error(`[email-activity-cleanup] Job ${job?.id} failed:`, err.message);
});

export const EMAIL_ACTIVITY_CLEANUP_QUEUE_NAME = QUEUE_NAME;
