import { Worker } from 'bullmq';
import { bullmqConnection } from '../queues/connection.js';
import { assertTenantId, QUEUE_NAMES } from '../queues/definitions.js';

export const emailPollingWorker = new Worker(
  QUEUE_NAMES.EMAIL_POLLING,
  async (job) => {
    assertTenantId(job.id, job.data);
    const { tenantId } = job.data;

    // Stub: Email inbox polling logic will be implemented in Phase 3
    console.log(`[email-polling] Processing job ${job.id} for tenant ${tenantId}`);
  },
  {
    connection: bullmqConnection,
    concurrency: 3,
  }
);

emailPollingWorker.on('failed', (job, err) => {
  console.error(`[email-polling] Job ${job?.id} failed:`, err.message);
});
