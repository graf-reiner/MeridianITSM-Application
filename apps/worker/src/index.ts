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
import { pushNotificationWorker } from './workers/push-notification.js';
import { chatCleanupWorker } from './workers/chat-cleanup.js';
import {
  usageSnapshotQueue,
  trialExpiryQueue,
  slaMonitorQueue,
  emailPollingQueue,
  scheduledReportQueue,
  webhookCleanupQueue,
  chatCleanupQueue,
} from './queues/definitions.js';

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
  { name: 'push-notification', worker: pushNotificationWorker },
  { name: 'chat-cleanup', worker: chatCleanupWorker },
];

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

// Schedule AI chat conversation cleanup daily at 3:30 AM UTC
void chatCleanupQueue.add(
  'cleanup-conversations',
  {},
  {
    repeat: { pattern: '30 3 * * *' },
    jobId: 'chat-cleanup-repeatable',
  },
);

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
