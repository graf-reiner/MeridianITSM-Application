'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiUpdate, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecurringTicket {
  id: string;
  name: string;
  schedule: string;
  timezone: string | null;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function RecurringTicketModal({ item, onClose, onSaved }: { item: RecurringTicket | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [schedule, setSchedule] = useState(item?.schedule ?? '');
  const [timezone, setTimezone] = useState(item?.timezone ?? 'UTC');
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [type, setType] = useState(item?.type ?? 'INCIDENT');
  const [priority, setPriority] = useState(item?.priority ?? 'MEDIUM');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(item ? `/api/v1/recurring-tickets/${item.id}` : '/api/v1/recurring-tickets', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          schedule: schedule.trim(),
          timezone: timezone.trim() || 'UTC',
          title: title.trim(),
          description: description.trim() || null,
          type,
          priority,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save recurring ticket');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 560, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{item ? 'Edit Recurring Ticket' : 'Create Recurring Ticket'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} placeholder="e.g. Weekly Server Check" />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="schedule" style={labelStyle}>Schedule (cron) *</label>
              <input id="schedule" type="text" value={schedule} onChange={(e) => setSchedule(e.target.value)} required style={inputStyle} placeholder="0 9 * * 1" />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Cron format: min hour day month weekday</p>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="timezone" style={labelStyle}>Timezone</label>
              <input id="timezone" type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle} placeholder="UTC" />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="title" style={labelStyle}>Ticket Title *</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="description" style={labelStyle}>Ticket Description</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="type" style={labelStyle}>Type</label>
              <select id="type" value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
                <option value="INCIDENT">Incident</option>
                <option value="REQUEST">Service Request</option>
                <option value="PROBLEM">Problem</option>
                <option value="CHANGE">Change</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="priority" style={labelStyle}>Priority</label>
              <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : item ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecurringTicketsSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<RecurringTicket | null>(null);

  const { data, isLoading } = useQuery<RecurringTicket[]>({
    queryKey: ['settings-recurring-tickets'],
    queryFn: async () => {
      const res = await fetch('/api/v1/recurring-tickets', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load recurring tickets');
      const json = await res.json();
      return Array.isArray(json) ? json : json.recurringTickets ?? json.data ?? [];
    },
  });

  const handleDelete = async (item: RecurringTicket) => {
    if (!window.confirm(`Delete recurring ticket "${item.name}"?`)) return;
    await fetch(`/api/v1/recurring-tickets/${item.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-recurring-tickets'] });
  };

  const items = data ?? [];

  const statusBadge = (active: boolean) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: active ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: active ? '#16a34a' : 'var(--text-muted)' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleString(); } catch { return d; }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiUpdate} size={1} color="#8b5cf6" />
          Recurring Tickets
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Recurring Ticket
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Schedule</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Ticket Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Next Run</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Last Run</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{item.schedule}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(item.isActive)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(item.nextRunAt)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(item.lastRunAt)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditItem(item); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" /> Edit
                      </button>
                      <button onClick={() => void handleDelete(item)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}>
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No recurring tickets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <RecurringTicketModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-recurring-tickets'] })}
        />
      )}
    </div>
  );
}
