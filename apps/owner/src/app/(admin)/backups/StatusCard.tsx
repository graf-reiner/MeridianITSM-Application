'use client';

// ─── Backup Status Card ───────────────────────────────────────────────────────
// Displays schedule info, last-run summary, and the "Backup now" trigger button.

import { useState } from 'react';
import { ownerFetch } from '../../../lib/api';
import type { BackupRow, BackupConfig } from './types';

interface Props {
  rows: BackupRow[];
  config: BackupConfig | null;
  isRunning: boolean;        // true while any row has status RUNNING
  onBackupEnqueued: () => void;
}

// ─── Cron → human-readable ────────────────────────────────────────────────────
const KNOWN_CRONS: Record<string, string> = {
  '0 2 * * *':   'Daily at 02:00 UTC',
  '0 3 * * *':   'Daily at 03:00 UTC',
  '0 0 * * *':   'Daily at 00:00 UTC',
  '0 2 * * 0':   'Weekly on Sunday at 02:00 UTC',
  '0 2 1 * *':   'Monthly on the 1st at 02:00 UTC',
  '0 2 * * 1-5': 'Weekdays at 02:00 UTC',
};

function humanCron(cron: string): string {
  return KNOWN_CRONS[cron] ?? cron;
}

// ─── Format relative time ─────────────────────────────────────────────────────
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Format size ──────────────────────────────────────────────────────────────
function formatSize(sizeBytes: string | null): string {
  if (!sizeBytes) return '—';
  const mb = Number(sizeBytes) / 1024 / 1024;
  if (mb < 0.1) return '< 0.1 MB';
  return `${mb.toFixed(1)} MB`;
}

// ─── Main card ────────────────────────────────────────────────────────────────
export default function StatusCard({ rows, config, isRunning, onBackupEnqueued }: Props) {
  const [enqueuing, setEnqueuing] = useState(false);
  const [enqueueResult, setEnqueueResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const lastComplete = rows.find(r => r.status === 'COMPLETE');
  const lastFailed   = rows.find(r => r.status === 'FAILED');

  // "Failed in last 30 days" — only show if the failure is recent
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentFailed = lastFailed && new Date(lastFailed.startedAt).getTime() > thirtyDaysAgo
    ? lastFailed
    : null;

  // Tenant count from dbRowCounts
  function tenantCount(row: BackupRow): string {
    if (row.dbRowCounts != null && typeof row.dbRowCounts === 'object' && 'tenants' in (row.dbRowCounts as Record<string, unknown>)) {
      return String((row.dbRowCounts as Record<string, unknown>)['tenants'] ?? '—');
    }
    return '—';
  }

  async function handleBackupNow() {
    setEnqueuing(true);
    setEnqueueResult(null);
    try {
      const res = await ownerFetch('/api/backups', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setEnqueueResult({ type: 'success', msg: 'Backup job enqueued — the table will update as it progresses.' });
      onBackupEnqueued();
    } catch (err) {
      setEnqueueResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to enqueue backup' });
    } finally {
      setEnqueuing(false);
    }
  }

  const btnDisabled = enqueuing || isRunning;

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        {/* Info grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Backup Status</h2>

          {/* Schedule */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#6b7280', minWidth: 120 }}>Schedule</span>
            <span style={{ fontSize: 13, color: '#374151' }}>
              {config
                ? config.scheduledEnabled
                  ? humanCron(config.scheduledCron)
                  : <span style={{ color: '#9ca3af' }}>Disabled</span>
                : <span style={{ color: '#9ca3af' }}>Loading…</span>}
            </span>
          </div>

          {/* Last successful */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#6b7280', minWidth: 120 }}>Last successful</span>
            {lastComplete ? (
              <span style={{ fontSize: 13, color: '#374151' }}>
                {formatRelative(lastComplete.startedAt)}
                {' · '}
                {formatSize(lastComplete.sizeBytes)}
                {' · '}
                {tenantCount(lastComplete)} tenants
                {lastComplete.attachmentCount != null && (
                  <> · {lastComplete.attachmentCount.toLocaleString()} attachments</>
                )}
              </span>
            ) : (
              <span style={{ fontSize: 13, color: '#9ca3af' }}>None</span>
            )}
          </div>

          {/* Last failed */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#6b7280', minWidth: 120 }}>Last failed</span>
            {recentFailed ? (
              <span style={{ fontSize: 13, color: '#b91c1c' }}>
                {formatRelative(recentFailed.startedAt)}
              </span>
            ) : (
              <span style={{ fontSize: 13, color: '#6b7280' }}>None in 30 days</span>
            )}
          </div>

          {/* Retention */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, color: '#6b7280', minWidth: 120 }}>Retention</span>
            <span style={{ fontSize: 13, color: '#374151' }}>
              {config ? (
                <>
                  Auto: {config.retentionScheduledDays} days · Manual: {config.retentionManualDays} days
                  {' '}
                  <a href="/settings#backups" style={{ fontSize: 12, color: '#4338ca', textDecoration: 'none' }}>
                    Edit in Settings →
                  </a>
                </>
              ) : (
                <span style={{ color: '#9ca3af' }}>Loading…</span>
              )}
            </span>
          </div>
        </div>

        {/* Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <button
            onClick={() => void handleBackupNow()}
            disabled={btnDisabled}
            style={{
              padding: '9px 20px',
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: btnDisabled ? '#9ca3af' : '#4338ca',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: btnDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {isRunning ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#93c5fd', display: 'inline-block' }} />
                Backup running…
              </>
            ) : enqueuing ? (
              'Enqueuing…'
            ) : (
              '▶ Backup now'
            )}
          </button>

          {enqueueResult && (
            <p
              style={{
                fontSize: 12,
                margin: 0,
                maxWidth: 260,
                textAlign: 'right',
                color: enqueueResult.type === 'success' ? '#166534' : '#991b1b',
                backgroundColor: enqueueResult.type === 'success' ? '#dcfce7' : '#fee2e2',
                padding: '6px 10px',
                borderRadius: 4,
              }}
            >
              {enqueueResult.msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
