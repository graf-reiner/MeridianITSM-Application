import 'dotenv/config';
import { slaMonitorWorker } from './workers/sla-monitor.js';
import { emailNotificationWorker } from './workers/email-notification.js';
import { emailPollingWorker } from './workers/email-polling.js';
import { cmdbReconciliationWorker } from './workers/cmdb-reconciliation.js';
import { stripeWebhookWorker } from './workers/stripe-webhook.js';
import { usageSnapshotWorker } from './workers/usage-snapshot.js';
import { trialExpiryWorker } from './workers/trial-expiry.js';
import { scheduledReportWorker } from './workers/scheduled-report.js';
import { webhookDeliveryWorker } from './workers/webhook-delivery.js';
import { webhookCleanupWorker } from './workers/webhook-cleanup.js';
import { inboundWebhookProcessWorker } from './workers/inbound-webhook-process.js';
import { inboundWebhookCleanupWorker } from './workers/inbound-webhook-cleanup.js';
import { pushNotificationWorker } from './workers/push-notification.js';
import { chatCleanupWorker } from './workers/chat-cleanup.js';
import { problemDetectionWorker } from './workers/problem-detection.js';
import { majorIncidentDetectionWorker } from './workers/major-incident-detection.js';
import { certExpiryMonitorWorker } from './workers/cert-expiry-monitor.js';
import { inventoryRetentionWorker, inventoryDiffBackfillWorker } from './workers/inventory-retention.worker.js';
import { emailActivityCleanupWorker, EMAIL_ACTIVITY_CLEANUP_QUEUE_NAME } from './workers/email-activity-cleanup.js';
import { workflowExecutionWorker } from './workers/workflow-execution.worker.js';
import { tenantCfProvisionWorker } from './workers/tenant-cf-provision.worker.js';
import { Queue } from 'bullmq';
import { bullmqConnection } from './queues/connection.js';
import {
  usageSnapshotQueue,
  trialExpiryQueue,
  slaMonitorQueue,
  emailPollingQueue,
  scheduledReportQueue,
  webhookCleanupQueue,
  chatCleanupQueue,
  problemDetectionQueue,
  majorIncidentDetectionQueue,
  certExpiryMonitorQueue,
  inventoryRetentionQueue,
  inventoryDiffBackfillQueue,
  inboundWebhookCleanupQueue,
} from './queues/definitions.js';
import { redisConnection } from './queues/connection.js';

const workers = [
  { name: 'sla-monitor', worker: slaMonitorWorker },
  { name: 'email-notification', worker: emailNotificationWorker },
  { name: 'email-polling', worker: emailPollingWorker },
  { name: 'cmdb-reconciliation', worker: cmdbReconciliationWorker },
  { name: 'stripe-webhook', worker: stripeWebhookWorker },
  { name: 'usage-snapshot', worker: usageSnapshotWorker },
  { name: 'trial-expiry', worker: trialExpiryWorker },
  { name: 'scheduled-report', worker: scheduledReportWorker },
  { name: 'webhook-delivery', worker: webhookDeliveryWorker },
  { name: 'webhook-cleanup', worker: webhookCleanupWorker },
  { name: 'inbound-webhook-process', worker: inboundWebhookProcessWorker },
  { name: 'inbound-webhook-cleanup', worker: inboundWebhookCleanupWorker },
  { name: 'push-notification', worker: pushNotificationWorker },
  { name: 'chat-cleanup', worker: chatCleanupWorker },
  { name: 'problem-detection', worker: problemDetectionWorker },
  { name: 'major-incident-detection', worker: majorIncidentDetectionWorker },
  { name: 'cert-expiry-monitor', worker: certExpiryMonitorWorker },
  { name: 'inventory-retention', worker: inventoryRetentionWorker },
  { name: 'inventory-diff-backfill', worker: inventoryDiffBackfillWorker },
  { name: 'email-activity-cleanup', worker: emailActivityCleanupWorker },
  { name: 'workflow-execution', worker: workflowExecutionWorker },
  { name: 'tenant-cf-provision', worker: tenantCfProvisionWorker },
];

const emailActivityCleanupQueue = new Queue(EMAIL_ACTIVITY_CLEANUP_QUEUE_NAME, { connection: bullmqConnection });

// Schedule SLA breach check every minute
void slaMonitorQueue.add(
  'check-sla',
  {},
  {
    repeat: { pattern: '* * * * *' },
    jobId: 'sla-monitor-repeatable', // Stable jobId prevents duplicate schedules on restart
  },
);

// Schedule daily usage snapshot at 2 AM UTC
void usageSnapshotQueue.add(
  'daily-snapshot',
  {},
  {
    repeat: { pattern: '0 2 * * *' },
    jobId: 'daily-snapshot-repeatable', // Stable jobId prevents duplicate schedules on restart
  },
);

// Schedule daily trial expiry check at 6 AM UTC
void trialExpiryQueue.add(
  'daily-trial-check',
  {},
  {
    repeat: { pattern: '0 6 * * *' },
    jobId: 'daily-trial-check-repeatable', // Stable jobId prevents duplicate schedules on restart
  },
);

// Schedule email polling every 5 minutes across all tenant mailboxes
void emailPollingQueue.add(
  'poll-emails',
  {},
  {
    repeat: { pattern: '*/5 * * * *' },
    jobId: 'email-polling-repeatable', // Stable jobId prevents duplicate schedules on restart
  },
);

// Schedule scheduled report check every hour
void scheduledReportQueue.add(
  'check-scheduled',
  {},
  {
    repeat: { pattern: '0 * * * *' },
    jobId: 'scheduled-report-repeatable', // Stable jobId prevents duplicate schedules on restart
  },
);

// Schedule webhook delivery history cleanup daily at 3:00 AM UTC
void webhookCleanupQueue.add(
  'cleanup',
  {},
  {
    repeat: { pattern: '0 3 * * *' },
    jobId: 'webhook-cleanup-repeatable',
  },
);

// Schedule inbound webhook delivery history cleanup daily at 4:00 AM UTC
// (one hour after the outbound cleanup so they don't compete on disk I/O).
void inboundWebhookCleanupQueue.add(
  'cleanup',
  {},
  {
    repeat: { pattern: '0 4 * * *' },
    jobId: 'inbound-webhook-cleanup-repeatable',
  },
);

// Schedule AI chat conversation cleanup daily at 3:30 AM UTC
void chatCleanupQueue.add(
  'cleanup-conversations',
  {},
  {
    repeat: { pattern: '30 3 * * *' },
    jobId: 'chat-cleanup-repeatable',
  },
);

// Schedule proactive problem detection daily at 4 AM UTC
void problemDetectionQueue.add(
  'detect-problems',
  {},
  {
    repeat: { pattern: '0 4 * * *' },
    jobId: 'problem-detection-repeatable',
  },
);

// Schedule major-incident detection every minute (outage signals must surface fast)
void majorIncidentDetectionQueue.add(
  'detect-major-incidents',
  {},
  {
    repeat: { pattern: '* * * * *' },
    jobId: 'major-incident-detection-repeatable',
  },
);

// Schedule APM cert expiry scan daily at 7 AM UTC
void certExpiryMonitorQueue.add(
  'scan-cert-expiry',
  {},
  {
    repeat: { pattern: '0 7 * * *' },
    jobId: 'cert-expiry-monitor-repeatable',
  },
);

// Schedule EmailActivityLog retention sweep daily at 3:45 AM UTC
void emailActivityCleanupQueue.add(
  'cleanup',
  {},
  {
    repeat: { pattern: '45 3 * * *' },
    jobId: 'email-activity-cleanup-repeatable',
  },
);

// Schedule nightly inventory retention sweep at 2 AM UTC
void inventoryRetentionQueue.add(
  'nightly-retention',
  {},
  {
    repeat: { pattern: '0 2 * * *' },
    jobId: 'inventory-retention-repeatable',
  },
);

// One-time InventoryDiff backfill: enqueue only if not already completed
void (async () => {
  try {
    const alreadyDone = await redisConnection.get('inventory-diff-backfill:completed');
    if (!alreadyDone) {
      await inventoryDiffBackfillQueue.add('backfill', {}, { jobId: 'inventory-diff-backfill-once' });
      console.log('[inventory-diff-backfill] Enqueued one-time backfill job');
    } else {
      console.log('[inventory-diff-backfill] Backfill already completed — skipping enqueue');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[inventory-diff-backfill] Failed to check/enqueue backfill: ${msg}`);
  }
})();

console.log('Worker process started — active workers:');
workers.forEach(({ name }) => console.log(`  - ${name}`));

async function shutdown(): Promise<void> {
  console.log('Shutting down workers...');
  await Promise.all(workers.map(({ worker }) => worker.close()));
  console.log('All workers shut down.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
