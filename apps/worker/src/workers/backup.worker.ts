import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';
import {
  createBackup,
  pruneBackups,
  DEFAULT_BACKUP_CONFIG,
  type BackupConfig,
} from '@meridian/backup';

// ─── Backup Worker ────────────────────────────────────────────────────────────
//
// Processes two job names on the 'backups' queue:
//
//   backup-create  — dumps Postgres + MinIO attachments, encrypts, uploads to
//                    the backup bucket, and writes a BackupRun audit row.
//                    Payload: { trigger: 'SCHEDULED' | 'MANUAL', triggeredById? }
//
//   backup-prune   — walks BackupRun rows past their retention window and
//                    deletes the MinIO object + audit row for each.
//
// Scheduling is registered inline in index.ts, following the project convention.
// The backupQueue exported from definitions.ts is imported by the owner admin API
// (Task 9) to enqueue on-demand MANUAL backups.
//
// Tenant note: BackupRun is a global owner table — no tenantId scoping needed.

async function loadBackupConfig(): Promise<BackupConfig> {
  const rows = await prisma.ownerSetting.findMany({
    where: { key: { startsWith: 'backup.' } },
  });
  const cfg: BackupConfig = { ...DEFAULT_BACKUP_CONFIG };
  for (const r of rows) {
    let v: unknown;
    try { v = JSON.parse(r.value); } catch { continue; }
    if      (r.key === 'backup.scheduledEnabled'       && typeof v === 'boolean') cfg.scheduledEnabled = v;
    else if (r.key === 'backup.scheduledCron'          && typeof v === 'string')  cfg.scheduledCron = v;
    else if (r.key === 'backup.retentionScheduledDays' && typeof v === 'number')  cfg.retentionScheduledDays = v;
    else if (r.key === 'backup.retentionManualDays'    && typeof v === 'number')  cfg.retentionManualDays = v;
    else if (r.key === 'backup.bucketName'             && typeof v === 'string')  cfg.bucketName = v;
  }
  return cfg;
}

export const backupWorker = new Worker(
  QUEUE_NAMES.BACKUPS,
  async (job) => {
    if (job.name === 'backup-create') {
      const cfg = await loadBackupConfig();
      const { trigger, triggeredById } = job.data as {
        trigger: 'SCHEDULED' | 'MANUAL';
        triggeredById?: string | null;
      };
      return createBackup({
        trigger,
        triggeredById:    triggeredById ?? null,
        bucketName:       cfg.bucketName,
        envName:          process.env['ENV_NAME'] ?? 'dev',
        databaseUrl:      process.env['DATABASE_URL']!,
        encryptionKey:    process.env['ENCRYPTION_KEY']!,
        attachmentBucket: process.env['MINIO_BUCKET'] ?? 'meridian-attachments',
        restoreCtx: {
          dbHost:  process.env['DB_HOST_DISPLAY']  ?? '10.1.200.78',
          dbName:  process.env['DB_NAME_DISPLAY']  ?? 'meridian',
          dbRole:  process.env['DB_ROLE_DISPLAY']  ?? 'meridian_dev',
          pmHosts: (process.env['PM_HOSTS_DISPLAY'] ?? 'meridian-dev').split(','),
        },
      });
    }

    if (job.name === 'backup-prune') {
      const cfg = await loadBackupConfig();
      return pruneBackups({
        bucketName:             cfg.bucketName,
        retentionScheduledDays: cfg.retentionScheduledDays,
        retentionManualDays:    cfg.retentionManualDays,
      });
    }

    throw new Error(`Unknown backup job: ${job.name}`);
  },
  {
    connection: bullmqConnection,
    concurrency: 1, // Backups are I/O-heavy; run one at a time
  },
);

backupWorker.on('completed', (job) => {
  console.log(`[backup] Job ${job.id} (${job.name}) completed`);
});

backupWorker.on('failed', (job, err) => {
  console.error(`[backup] Job ${job?.id} (${job?.name}) failed:`, err.message);
});
