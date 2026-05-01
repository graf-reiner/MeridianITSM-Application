// ─── Shared types for the /backups page ───────────────────────────────────────
// These mirror the API response shapes from GET /api/backups and GET /api/backups/settings.

export type BackupTrigger = 'SCHEDULED' | 'MANUAL';
export type BackupStatus  = 'RUNNING'   | 'COMPLETE' | 'FAILED';

export interface BackupRow {
  id: string;
  status: BackupStatus;
  trigger: BackupTrigger;
  startedAt: string;
  completedAt: string | null;
  sizeBytes: string | null;        // BigInt serialised as string by jsonResponse()
  objectKey: string | null;
  keyFingerprint: string | null;
  attachmentCount: number | null;
  dbRowCounts: unknown;            // JSON object e.g. { tenants: 12, tickets: 4200, ... }
  errorMessage: string | null;
  triggeredBy: { id: string; email: string } | null;
}

export interface BackupListResponse {
  rows: BackupRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface BackupConfig {
  bucketName: string;
  scheduledEnabled: boolean;
  scheduledCron: string;
  retentionScheduledDays: number;
  retentionManualDays: number;
}
