'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiTrayFull, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Queue {
  id: string;
  name: string;
  autoAssign: boolean;
  defaultAssignee: { id: string; firstName: string; lastName: string } | null;
  _count?: { tickets: number };
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
}

// ─── Queue Modal ──────────────────────────────────────────────────────────────

function QueueModal({ queue, users, onClose, onSaved }: { queue: Queue | null; users: UserOption[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(queue?.name ?? '');
  const [autoAssign, setAutoAssign] = useState(queue?.autoAssign ?? false);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState(queue?.defaultAssignee?.id ?? '');
  const [assignmentRules, setAssignmentRules] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        autoAssign,
        defaultAssigneeId: defaultAssigneeId || undefined,
      };
      if (assignmentRules.trim()) {
        try { body.assignmentRules = JSON.parse(assignmentRules); } catch { /* ignore invalid JSON */ }
      }
      const res = await fetch(queue ? `/api/v1/settings/queues/${queue.id}` : '/api/v1/settings/queues', {
        method: queue ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save queue');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save queue');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: '#374151' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{queue ? 'Edit Queue' : 'Create Queue'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} />
              <span>Auto-Assign tickets</span>
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="defaultAssignee" style={labelStyle}>Default Assignee</label>
            <select id="defaultAssignee" value={defaultAssigneeId} onChange={(e) => setDefaultAssigneeId(e.target.value)} style={inputStyle}>
              <option value="">-- None --</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="assignmentRules" style={labelStyle}>Assignment Rules (JSON)</label>
            <textarea
              id="assignmentRules"
              value={assignmentRules}
              onChange={(e) => setAssignmentRules(e.target.value)}
              placeholder={'{"priority": "CRITICAL", "assignTo": "user-id"}'}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Optional JSON rules for automatic assignment logic</p>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : queue ? 'Save Changes' : 'Create Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Queues Settings Page ─────────────────────────────────────────────────────

export default function QueuesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editQueue, setEditQueue] = useState<Queue | null>(null);

  const { data, isLoading } = useQuery<Queue[]>({
    queryKey: ['settings-queues'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load queues');
      const json = await res.json();
      // API may return array directly or { queues: [...] }
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const { data: usersData } = useQuery<{ users: UserOption[] }>({
    queryKey: ['settings-users-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) return { users: [] };
      return res.json() as Promise<{ users: UserOption[] }>;
    },
  });

  const handleDelete = async (queue: Queue) => {
    if (!window.confirm(`Delete queue "${queue.name}"?`)) return;
    await fetch(`/api/v1/settings/queues/${queue.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-queues'] });
  };

  const queues = data ?? [];
  const users = usersData?.users ?? [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTrayFull} size={1} color="#0891b2" />
          Queues
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditQueue(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Queue
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading queues...</div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Auto-Assign</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Default Assignee</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{queue.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: queue.autoAssign ? '#d1fae5' : '#f3f4f6', color: queue.autoAssign ? '#065f46' : '#6b7280' }}>
                      {queue.autoAssign ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>
                    {queue.defaultAssignee ? `${queue.defaultAssignee.firstName} ${queue.defaultAssignee.lastName}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditQueue(queue); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(queue)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {queues.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No queues found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <QueueModal
          queue={editQueue}
          users={users}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-queues'] })}
        />
      )}
    </div>
  );
}
