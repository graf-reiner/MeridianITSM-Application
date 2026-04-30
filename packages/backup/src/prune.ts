import { prisma } from '@meridian/db';
import { deleteObject } from './minio.js';

export interface PruneInput {
  bucketName: string;
  retentionScheduledDays: number;
  retentionManualDays:    number;
}

export interface PruneResult {
  deletedCount: number;
  errors:       Array<{ runId: string; message: string }>;
}

/**
 * Walks BackupRun rows past their retention window and deletes both the MinIO
 * object and the audit row. Per-row failures are collected in `errors` rather
 * than thrown so a single bad row doesn't block the rest of the prune.
 */
export async function pruneBackups(input: PruneInput): Promise<PruneResult> {
  const now = Date.now();
  const scheduledCutoff = new Date(now - input.retentionScheduledDays * 24 * 3600 * 1000);
  const manualCutoff    = new Date(now - input.retentionManualDays    * 24 * 3600 * 1000);

  const stale = await prisma.backupRun.findMany({
    where: {
      OR: [
        { trigger: 'SCHEDULED', startedAt: { lt: scheduledCutoff } },
        { trigger: 'MANUAL',    startedAt: { lt: manualCutoff } },
      ],
    },
    select: { id: true, objectKey: true, status: true },
  });

  const errors: Array<{ runId: string; message: string }> = [];
  let deletedCount = 0;

  for (const r of stale) {
    if (r.objectKey) {
      try { await deleteObject(input.bucketName, r.objectKey); }
      catch (err) {
        errors.push({ runId: r.id, message: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }
    try {
      await prisma.backupRun.delete({ where: { id: r.id } });
      deletedCount++;
    } catch (err) {
      errors.push({ runId: r.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return { deletedCount, errors };
}
