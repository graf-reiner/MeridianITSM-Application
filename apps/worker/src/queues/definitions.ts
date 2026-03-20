import { Queue } from 'bullmq';
import { bullmqConnection } from './connection.js';

export const QUEUE_NAMES = {
  SLA_MONITOR: 'sla-monitor',
  EMAIL_NOTIFICATION: 'email-notification',
  EMAIL_POLLING: 'email-polling',
  CMDB_RECONCILIATION: 'cmdb-reconciliation',
} as const;

export interface TenantJobData {
  tenantId: string;
  [key: string]: unknown;
}

export function assertTenantId(jobId: string | undefined, data: unknown): asserts data is TenantJobData {
  if (
    !data ||
    typeof data !== 'object' ||
    !('tenantId' in data) ||
    typeof (data as Record<string, unknown>).tenantId !== 'string'
  ) {
    throw new Error(`Job ${jobId ?? 'unknown'} missing tenantId -- refusing to process`);
  }
}

// Queue instances (used by API to enqueue jobs)
export const slaMonitorQueue = new Queue(QUEUE_NAMES.SLA_MONITOR, { connection: bullmqConnection });
export const emailNotificationQueue = new Queue(QUEUE_NAMES.EMAIL_NOTIFICATION, { connection: bullmqConnection });
export const emailPollingQueue = new Queue(QUEUE_NAMES.EMAIL_POLLING, { connection: bullmqConnection });
export const cmdbReconciliationQueue = new Queue(QUEUE_NAMES.CMDB_RECONCILIATION, { connection: bullmqConnection });
