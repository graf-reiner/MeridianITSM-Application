'use client';

// ─── Backups Table ────────────────────────────────────────────────────────────
// Renders the list of BackupRun rows with per-row actions.

import { useState } from 'react';
import { ownerFetch } from '../../../lib/api';
import type { BackupRow } from './types';

interface Props {
  rows: BackupRow[];
  onDeleted: (id: string) => void;
  onRestoreInstructions: (runId: string) => void;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: BackupRow['status'] }) {
  const map: Record<BackupRow['status'], { bg: string; text: string; label: string }> = {
    RUNNING:  { bg: '#dbeafe', text: '#1e40af', label: 'Running' },
    COMPLETE: { bg: '#dcfce7', text: '#166534', label: 'Complete' },
    FAILED:   { bg: '#fee2e2', text: '#991b1b', label: 'Failed'   },
  };
  const s = map[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, backgroundColor: s.bg, color: s.text }}>
      {status === 'RUNNING' && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3b82f6', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
      )}
      {s.label}
    </span>
  );
}

// ─── Format file size ─────────────────────────────────────────────────────────
function formatSize(sizeBytes: string | null): string {
  if (!sizeBytes) return '—';
  const mb = Number(sizeBytes) / 1024 / 1024;
  if (mb < 0.1) return '< 0.1 MB';
  return `${mb.toFixed(1)} MB`;
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

// ─── Trigger cell ─────────────────────────────────────────────────────────────
function TriggerCell({ row }: { row: BackupRow }) {
  if (row.trigger === 'SCHEDULED') {
    return <span style={{ fontSize: 13, color: '#64748b' }}>Scheduled</span>;
  }
  return (
    <span style={{ fontSize: 13, color: '#374151' }}>
      Manual
      {row.triggeredBy?.email && (
        <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{row.triggeredBy.email}</span>
      )}
    </span>
  );
}

// ─── Row actions ──────────────────────────────────────────────────────────────
function RowActions({ row, onDeleted, onRestoreInstructions }: { row: BackupRow; onDeleted: (id: string) => void; onRestoreInstructions: (id: string) => void }) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await ownerFetch(`/api/backups/${row.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { downloadUrl: string | null };
      if (data.downloadUrl) {
        window.location.href = data.downloadUrl;
      } else {
        alert('Download URL not available. The backup file may have expired or been removed.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to get download URL');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this backup? This also removes the archive from object storage and cannot be undone.')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await ownerFetch(`/api/backups/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      onDeleted(row.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    cursor: 'pointer',
    border: '1px solid',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* COMPLETE actions */}
      {row.status === 'COMPLETE' && (
        <>
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            style={{ ...btnBase, backgroundColor: downloading ? '#f1f5f9' : '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe', cursor: downloading ? 'not-allowed' : 'pointer' }}
          >
            {downloading ? 'Getting URL…' : 'Download'}
          </button>
          <button
            onClick={() => onRestoreInstructions(row.id)}
            style={{ ...btnBase, backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}
          >
            Restore guide
          </button>
        </>
      )}

      {/* FAILED — view error */}
      {row.status === 'FAILED' && row.errorMessage && (
        <>
          <button
            onClick={() => setErrorDialogOpen(true)}
            style={{ ...btnBase, backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
          >
            View error
          </button>
          {errorDialogOpen && (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }}
              onClick={e => { if (e.target === e.currentTarget) setErrorDialogOpen(false); }}
            >
              <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 540, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#991b1b' }}>Backup Error</h3>
                <pre style={{ margin: 0, fontSize: 12, color: '#374151', background: '#fee2e2', padding: 12, borderRadius: 6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, overflowY: 'auto' }}>
                  {row.errorMessage}
                </pre>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setErrorDialogOpen(false)}
                    style={{ padding: '7px 18px', fontSize: 13, fontWeight: 500, backgroundColor: '#4338ca', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete — available for all statuses */}
      <button
        onClick={() => void handleDelete()}
        disabled={deleting}
        style={{ ...btnBase, backgroundColor: deleting ? '#f9fafb' : '#fff', color: deleting ? '#9ca3af' : '#9ca3af', borderColor: '#e5e7eb', cursor: deleting ? 'not-allowed' : 'pointer' }}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>

      {deleteError && (
        <span style={{ fontSize: 11, color: '#b91c1c' }}>{deleteError}</span>
      )}
    </div>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────
export default function BackupsTable({ rows, onDeleted, onRestoreInstructions }: Props) {
  const columns = ['Started', 'Trigger', 'Status', 'Size', 'Tenants', 'Attachments', 'Key fingerprint', 'Actions'];

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
          Backup Runs
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: '#6b7280' }}>({rows.length})</span>
        </h2>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb' }}>
              {columns.map(col => (
                <th
                  key={col}
                  style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                  {new Date(row.startedAt).toLocaleString()}
                  <span style={{ display: 'block', fontSize: 11, color: '#9ca3af' }}>{formatRelative(row.startedAt)}</span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <TriggerCell row={row} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                  {formatSize(row.sizeBytes)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>
                  {row.dbRowCounts != null && typeof row.dbRowCounts === 'object' && 'tenants' in (row.dbRowCounts as Record<string, unknown>)
                    ? String((row.dbRowCounts as Record<string, unknown>)['tenants'] ?? '—')
                    : '—'}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151', textAlign: 'right' }}>
                  {row.attachmentCount != null ? row.attachmentCount.toLocaleString() : '—'}
                </td>
                <td style={{ padding: '10px 12px', fontSize: 11, color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {row.keyFingerprint ? row.keyFingerprint.slice(0, 16) + '…' : <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <RowActions row={row} onDeleted={onDeleted} onRestoreInstructions={onRestoreInstructions} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                  No backup runs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
