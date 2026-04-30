export type BackupTrigger = 'SCHEDULED' | 'MANUAL';
export type BackupStatus  = 'RUNNING' | 'COMPLETE' | 'FAILED';

export interface BackupConfig {
  bucketName: string;
  scheduledEnabled: boolean;
  scheduledCron: string;          // crontab expression
  retentionScheduledDays: number;
  retentionManualDays:    number;
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  bucketName:             'meridian-backups',
  scheduledEnabled:       true,
  scheduledCron:          '0 2 * * *',  // 02:00 UTC daily
  retentionScheduledDays: 14,
  retentionManualDays:    30,
};
