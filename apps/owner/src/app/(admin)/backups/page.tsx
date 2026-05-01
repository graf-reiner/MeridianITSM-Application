'use client';

// ─── /backups page — Owner Admin ──────────────────────────────────────────────
// Lists BackupRun rows, shows a status card, polls while a backup is RUNNING,
// and opens the RestoreInstructionsModal on demand.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ownerFetch } from '../../../lib/api';
import StatusCard from './StatusCard';
import BackupsTable from './BackupsTable';
import RestoreInstructionsModal from './RestoreInstructionsModal';
import type { BackupRow, BackupListResponse, BackupConfig } from './types';

const POLL_INTERVAL_MS = 2000; // 2s poll while a row is RUNNING
const PAGE_LIMIT = 25;

export default function BackupsPage() {
  const [rows, setRows]       = useState<BackupRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [config, setConfig]   = useState<BackupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [offset, setOffset]   = useState(0);

  // Modal state
  const [restoreRunId, setRestoreRunId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch the backup list ─────────────────────────────────────────────────
  const fetchRows = useCallback(async (currentOffset: number) => {
    try {
      const res = await ownerFetch(`/api/backups?limit=${PAGE_LIMIT}&offset=${currentOffset}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BackupListResponse = await res.json();
      setRows(data.rows);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch backup settings (for StatusCard) ────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const res = await ownerFetch('/api/backups/settings');
      if (!res.ok) return; // silently ignore — config is optional UI detail
      const cfg: BackupConfig = await res.json();
      setConfig(cfg);
    } catch {
      // non-critical
    }
  }, []);

  // ─── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    void fetchRows(0);
    void fetchConfig();
  }, [fetchRows, fetchConfig]);

  // ─── Polling: start when any row is RUNNING, stop when none ───────────────
  const hasRunning = rows.some(r => r.status === 'RUNNING');

  useEffect(() => {
    if (hasRunning) {
      if (pollRef.current) return; // already polling
      pollRef.current = setInterval(() => {
        void fetchRows(offset);
      }, POLL_INTERVAL_MS);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      // cleanup on unmount
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasRunning, fetchRows, offset]);

  // ─── Handle row deleted ───────────────────────────────────────────────────
  function handleDeleted(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
    setTotal(prev => Math.max(0, prev - 1));
  }

  // ─── Handle backup enqueued ───────────────────────────────────────────────
  function handleBackupEnqueued() {
    // Brief delay then refresh so the RUNNING row has time to appear
    setTimeout(() => {
      setLoading(true);
      void fetchRows(offset);
    }, 800);
  }

  // ─── Pagination ───────────────────────────────────────────────────────────
  const pageCount = Math.ceil(total / PAGE_LIMIT);
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

  function goToPage(page: number) {
    const newOffset = (page - 1) * PAGE_LIMIT;
    setOffset(newOffset);
    setLoading(true);
    void fetchRows(newOffset);
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Database Backups</h1>
        <p style={{ color: '#6b7280', marginTop: 4, fontSize: 14 }}>
          Full database backups with attachments. Each backup captures all tenant data in a single encrypted archive.
        </p>
      </div>

      {/* Warning banner */}
      <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, color: '#92400e', fontSize: 13, marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <div>
          <strong>Owner-only operation.</strong>{' '}
          Backup archives are stored in object storage and contain all tenant data. Treat them as highly sensitive.
          Restore operations require direct database access — see the Restore guide for each completed backup.
        </div>
      </div>

      {/* Status card */}
      <StatusCard
        rows={rows}
        config={config}
        isRunning={hasRunning}
        onBackupEnqueued={handleBackupEnqueued}
      />

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', borderRadius: 6, color: '#991b1b', marginBottom: 16, fontSize: 14 }}>
          Error: {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280', fontSize: 14 }}>
          Loading backup history…
        </div>
      )}

      {/* Table */}
      {(!loading || rows.length > 0) && (
        <BackupsTable
          rows={rows}
          onDeleted={handleDeleted}
          onRestoreInstructions={id => setRestoreRunId(id)}
        />
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            Page {currentPage} of {pageCount} ({total.toLocaleString()} runs)
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              style={{ padding: '6px 12px', fontSize: 13, backgroundColor: '#fff', color: currentPage <= 1 ? '#9ca3af' : '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: currentPage <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= pageCount}
              style={{ padding: '6px 12px', fontSize: 13, backgroundColor: '#fff', color: currentPage >= pageCount ? '#9ca3af' : '#374151', border: '1px solid #d1d5db', borderRadius: 4, cursor: currentPage >= pageCount ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Restore instructions modal */}
      {restoreRunId && (
        <RestoreInstructionsModal
          runId={restoreRunId}
          onClose={() => setRestoreRunId(null)}
        />
      )}
    </div>
  );
}
