// Helper for enqueueing tenant-cf-provision jobs from the owner-admin app.
// Mirrors the BullMQ connection shape used by `apps/owner/src/app/api/system/route.ts`
// and `apps/worker/src/queues/connection.ts`. The worker app owns the consumer
// side; owner-admin only enqueues.

import { Queue } from 'bullmq';

export const TENANT_CF_PROVISION_QUEUE = 'tenant-cf-provision';

export interface TenantCfProvisionJobData {
  tenantId: string;
  hostname: string;
  cloudflareDomainId: string;
  retry?: boolean;
}

function bullmqConnection() {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export async function enqueueTenantCfProvision(data: TenantCfProvisionJobData): Promise<void> {
  const queue = new Queue(TENANT_CF_PROVISION_QUEUE, {
    connection: bullmqConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 200 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  try {
    // Use tenantId as deterministic jobId so a duplicate enqueue while a job
    // is still queued/active is a no-op. After a job completes/fails BullMQ
    // releases the id, so retries from the operator UI can re-enqueue.
    await queue.add('provision', data, { jobId: data.tenantId });
  } finally {
    await queue.close();
  }
}
