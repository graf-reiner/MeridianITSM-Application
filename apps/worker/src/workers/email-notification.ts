import { Worker } from 'bullmq';
import { bullmqConnection } from '../queues/connection.js';
import { assertTenantId, QUEUE_NAMES } from '../queues/definitions.js';

export const emailNotificationWorker = new Worker(
  QUEUE_NAMES.EMAIL_NOTIFICATION,
  async (job) => {
    assertTenantId(job.id, job.data);
    const { tenantId } = job.data;

    // Stub: Email notification dispatch logic will be implemented in Phase 3
    console.log(`[email-notification] Processing job ${job.id} for tenant ${tenantId}`);
  },
  {
    connection: bullmqConnection,
    concurrency: 10,
  }
);

emailNotificationWorker.on('failed', (job, err) => {
  console.error(`[email-notification] Job ${job?.id} failed:`, err.message);
});
