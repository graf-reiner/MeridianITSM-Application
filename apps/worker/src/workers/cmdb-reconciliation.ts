import { Worker } from 'bullmq';
import { bullmqConnection } from '../queues/connection.js';
import { assertTenantId, QUEUE_NAMES } from '../queues/definitions.js';

export const cmdbReconciliationWorker = new Worker(
  QUEUE_NAMES.CMDB_RECONCILIATION,
  async (job) => {
    assertTenantId(job.id, job.data);
    const { tenantId } = job.data;

    // Stub: CMDB reconciliation logic will be implemented in Phase 4
    console.log(`[cmdb-reconciliation] Processing job ${job.id} for tenant ${tenantId}`);
  },
  {
    connection: bullmqConnection,
    concurrency: 2,
  }
);

cmdbReconciliationWorker.on('failed', (job, err) => {
  console.error(`[cmdb-reconciliation] Job ${job?.id} failed:`, err.message);
});
