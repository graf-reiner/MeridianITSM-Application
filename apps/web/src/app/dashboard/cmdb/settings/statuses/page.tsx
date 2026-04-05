'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiListStatus,
  mdiPlus,
  mdiPencil,
  mdiTrashCan,
  mdiCheckCircle,
  mdiCloseCircle,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CmdbStatus {
  id: string;
  statusKey: string;
  statusName: string;
  statusType: 'lifecycle' | 'operational';
  sortOrder: number;
  isActive: boolean;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 100,
        padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500,
        backgroundColor: type === 'success' ? '#065f46' : '#991b1b', color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

// ─── Status Modal ─────────────────────────────────────────────────────────────

function StatusModal({
  status,
  onClose,
  onSaved,
}: {
  status: CmdbStatus | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [statusKey, setStatusKey] = useState(status?.statusKey ?? '');
  const [statusName, setStatusName] = useState(status?.statusName ?? '');
  const [statusType, setStatusType] = useState<'lifecycle' | 'operational'>(status?.statusType ?? 'lifecycle');
  const [sortOrder, setSortOrder] = useState(status?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(status?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        statusKey: statusKey.trim(),
        statusName: statusName.trim(),
        statusType,
        sortOrder,
        isActive,
      };
      const url = status ? `/api/v1/cmdb/statuses/${status.id}` : '/api/v1/cmdb/statuses';
      const res = await fetch(url, {
        method: status ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save status');
      }
      onSaved(status ? 'Status updated successfully' : 'Status created successfully');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save status');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{status ? 'Edit Status' : 'Add Status'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="statusType" style={labelStyle}>Status Type *</label>
            <select id="statusType" value={statusType} onChange={(e) => setStatusType(e.target.value as 'lifecycle' | 'operational')} style={inputStyle}>
              <option value="lifecycle">Lifecycle</option>
              <option value="operational">Operational</option>
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="statusKey" style={labelStyle}>Status Key *</label>
            <input id="statusKey" type="text" value={statusKey} onChange={(e) => setStatusKey(e.target.value)} required placeholder="e.g. ACTIVE" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="statusName" style={labelStyle}>Status Name *</label>
            <input id="statusName" type="text" value={statusName} onChange={(e) => setStatusName(e.target.value)} required placeholder="e.g. Active" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="sortOrder" style={labelStyle}>Sort Order</label>
            <input id="sortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="isActive" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>Active</label>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : status ? 'Save Changes' : 'Add Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Status Table Section ─────────────────────────────────────────────────────

function StatusTable({
  title,
  statuses,
  onEdit,
  onDelete,
}: {
  title: string;
  statuses: CmdbStatus[];
  onEdit: (s: CmdbStatus) => void;
  onDelete: (s: CmdbStatus) => void;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status Key</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status Name</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Sort Order</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Active</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined }}>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 13 }}>{s.statusKey}</td>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{s.statusName}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{s.sortOrder}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                  <Icon path={s.isActive ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={s.isActive ? '#059669' : '#9ca3af'} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => onEdit(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                    >
                      <Icon path={mdiPencil} size={0.65} color="currentColor" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                    >
                      <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {statuses.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No statuses in this group</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── CMDB Statuses Page ───────────────────────────────────────────────────────

export default function CMDBStatusesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editStatus, setEditStatus] = useState<CmdbStatus | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery<CmdbStatus[]>({
    queryKey: ['cmdb-statuses'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/statuses', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load statuses');
      const json = await res.json();
      return Array.isArray(json) ? json : json.statuses ?? json.data ?? [];
    },
  });

  const handleDelete = async (status: CmdbStatus) => {
    if (!window.confirm(`Delete status "${status.statusName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cmdb/statuses/${status.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to delete status');
      }
      setToast({ message: 'Status deleted', type: 'success' });
      void qc.invalidateQueries({ queryKey: ['cmdb-statuses'] });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const statuses = data ?? [];
  const lifecycleStatuses = statuses.filter((s) => s.statusType === 'lifecycle').sort((a, b) => a.sortOrder - b.sortOrder);
  const operationalStatuses = statuses.filter((s) => s.statusType === 'operational').sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Link href="/dashboard/cmdb/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>
          <Link href="/dashboard/cmdb" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CMDB</Link>
          {' > '}
          <Link href="/dashboard/cmdb/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Settings</Link>
          {' > Statuses'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiListStatus} size={1} color="#059669" />
          CMDB Statuses
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditStatus(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Status
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading statuses...</div>
      ) : (
        <>
          <StatusTable
            title="Lifecycle Statuses"
            statuses={lifecycleStatuses}
            onEdit={(s) => { setEditStatus(s); setShowModal(true); }}
            onDelete={(s) => void handleDelete(s)}
          />
          <StatusTable
            title="Operational Statuses"
            statuses={operationalStatuses}
            onEdit={(s) => { setEditStatus(s); setShowModal(true); }}
            onDelete={(s) => void handleDelete(s)}
          />
        </>
      )}

      {showModal && (
        <StatusModal
          status={editStatus}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => {
            setToast({ message: msg, type: 'success' });
            void qc.invalidateQueries({ queryKey: ['cmdb-statuses'] });
          }}
        />
      )}
    </div>
  );
}
