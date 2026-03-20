import { Worker } from 'bullmq';
import { bullmqConnection } from '../queues/connection.js';
import { assertTenantId, QUEUE_NAMES } from '../queues/definitions.js';

export const slaMonitorWorker = new Worker(
  QUEUE_NAMES.SLA_MONITOR,
  async (job) => {
    assertTenantId(job.id, job.data);
    const { tenantId } = job.data;

    // Stub: SLA breach monitoring logic will be implemented in Phase 3
    console.log(`[sla-monitor] Processing job ${job.id} for tenant ${tenantId}`);
  },
  {
    connection: bullmqConnection,
    concurrency: 5,
  }
);

slaMonitorWorker.on('failed', (job, err) => {
  console.error(`[sla-monitor] Job ${job?.id} failed:`, err.message);
});
