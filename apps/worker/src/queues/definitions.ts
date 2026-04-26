import { Queue } from 'bullmq';
import { bullmqConnection } from './connection.js';

export const QUEUE_NAMES = {
  SLA_MONITOR: 'sla-monitor',
  EMAIL_NOTIFICATION: 'email-notification',
  EMAIL_POLLING: 'email-polling',
  CMDB_RECONCILIATION: 'cmdb-reconciliation',
  STRIPE_WEBHOOK: 'stripe-webhook',
  TRIAL_EXPIRY: 'trial-expiry',
  USAGE_SNAPSHOT: 'usage-snapshot',
  SCHEDULED_REPORT: 'scheduled-report',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  WEBHOOK_CLEANUP: 'webhook-cleanup',
  PUSH_NOTIFICATION: 'push-notification',
  CHAT_CLEANUP: 'chat-cleanup',
  PROBLEM_DETECTION: 'problem-detection',
  MAJOR_INCIDENT_DETECTION: 'major-incident-detection',
  CERT_EXPIRY_MONITOR: 'cert-expiry-monitor',
  INVENTORY_RETENTION: 'inventory-retention',
  INVENTORY_DIFF_BACKFILL: 'inventory-diff-backfill',
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
export const stripeWebhookQueue = new Queue(QUEUE_NAMES.STRIPE_WEBHOOK, { connection: bullmqConnection });
export const trialExpiryQueue = new Queue(QUEUE_NAMES.TRIAL_EXPIRY, { connection: bullmqConnection });
export const usageSnapshotQueue = new Queue(QUEUE_NAMES.USAGE_SNAPSHOT, { connection: bullmqConnection });
export const scheduledReportQueue = new Queue(QUEUE_NAMES.SCHEDULED_REPORT, { connection: bullmqConnection });
export const webhookDeliveryQueue = new Queue(QUEUE_NAMES.WEBHOOK_DELIVERY, { connection: bullmqConnection });
export const webhookCleanupQueue = new Queue(QUEUE_NAMES.WEBHOOK_CLEANUP, { connection: bullmqConnection });
export const pushNotificationQueue = new Queue(QUEUE_NAMES.PUSH_NOTIFICATION, { connection: bullmqConnection });
export const chatCleanupQueue = new Queue(QUEUE_NAMES.CHAT_CLEANUP, { connection: bullmqConnection });
export const problemDetectionQueue = new Queue(QUEUE_NAMES.PROBLEM_DETECTION, { connection: bullmqConnection });
export const majorIncidentDetectionQueue = new Queue(QUEUE_NAMES.MAJOR_INCIDENT_DETECTION, { connection: bullmqConnection });
export const certExpiryMonitorQueue = new Queue(QUEUE_NAMES.CERT_EXPIRY_MONITOR, { connection: bullmqConnection });
export const inventoryRetentionQueue = new Queue(QUEUE_NAMES.INVENTORY_RETENTION, { connection: bullmqConnection });
export const inventoryDiffBackfillQueue = new Queue(QUEUE_NAMES.INVENTORY_DIFF_BACKFILL, { connection: bullmqConnection });
