import 'dotenv/config';
import { slaMonitorWorker } from './workers/sla-monitor.js';
import { emailNotificationWorker } from './workers/email-notification.js';
import { emailPollingWorker } from './workers/email-polling.js';
import { cmdbReconciliationWorker } from './workers/cmdb-reconciliation.js';

const workers = [
  { name: 'sla-monitor', worker: slaMonitorWorker },
  { name: 'email-notification', worker: emailNotificationWorker },
  { name: 'email-polling', worker: emailPollingWorker },
  { name: 'cmdb-reconciliation', worker: cmdbReconciliationWorker },
];

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
