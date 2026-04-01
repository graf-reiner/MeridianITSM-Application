'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiAccountGroup, mdiPlus, mdiCalendar } from '@mdi/js';
import RichTextField from '@/components/RichTextField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CABMeeting {
  id: string;
  title: string;
  scheduledFor: string;
  status: string;
  location: string | null;
  _count?: { attendees: number; changes: number };
}

interface CABMeetingListResponse {
  meetings: CABMeeting[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'SCHEDULED':   return { bg: '#dbeafe', text: '#1e40af' };
    case 'IN_PROGRESS': return { bg: '#fef3c7', text: '#92400e' };
    case 'COMPLETED':   return { bg: '#d1fae5', text: '#065f46' };
    case 'CANCELLED':   return { bg: '#f3f4f6', text: '#9ca3af' };
    default:            return { bg: '#f3f4f6', text: '#374151' };
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Create Meeting Modal ─────────────────────────────────────────────────────

function CreateMeetingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', scheduledFor: '', location: '', meetingUrl: '', durationMinutes: '60', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.title || !form.scheduledFor) { setError('Title and scheduled date are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v1/cab/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.title,
          scheduledFor: new Date(form.scheduledFor).toISOString(),
          location: form.location || undefined,
          meetingUrl: form.meetingUrl || undefined,
          durationMinutes: Number(form.durationMinutes) || 60,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? `Failed: ${res.status}`); }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 500 as const, color: '#374151', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>New CAB Meeting</h2>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Title *</label>
          <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="e.g. Weekly CAB Review" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Date & Time *</label>
          <input type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Location</label>
            <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={inputStyle} placeholder="Conference Room A" />
          </div>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <input type="number" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} style={inputStyle} min="15" max="480" />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Meeting URL</label>
          <input type="url" value={form.meetingUrl} onChange={(e) => setForm((f) => ({ ...f, meetingUrl: e.target.value }))} style={inputStyle} placeholder="https://meet.example.com/..." />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notes</label>
          <RichTextField value={form.notes} onChange={(val) => setForm((f) => ({ ...f, notes: val }))} placeholder="" minHeight={80} compact />
        </div>
        {error && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void handleSave()} disabled={saving} style={{ flex: 1, padding: '9px 0', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Creating...' : 'Create Meeting'}
          </button>
          <button onClick={onClose} style={{ padding: '9px 16px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CAB Meetings List Page ───────────────────────────────────────────────────

export default function CABPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useQuery<CABMeetingListResponse>({
    queryKey: ['cab-meetings'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cab/meetings', { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load meetings: ${res.status}`);
      return res.json() as Promise<CABMeetingListResponse>;
    },
  });

  const meetings = data?.meetings ?? [];

  const handleCreated = () => {
    setShowCreate(false);
    void queryClient.invalidateQueries({ queryKey: ['cab-meetings'] });
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiAccountGroup} size={1} color="#4f46e5" />
          CAB Meetings
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon path={mdiPlus} size={0.8} color="currentColor" />
          New CAB Meeting
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading meetings...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          {error instanceof Error ? error.message : 'Failed to load meetings'}
        </div>
      ) : meetings.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiAccountGroup} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: '#6b7280', fontSize: 14 }}>No CAB meetings scheduled</p>
          <button
            onClick={() => setShowCreate(true)}
            style={{ marginTop: 12, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
          >
            Schedule First Meeting
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Scheduled For</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Attendees</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Changes</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((meeting) => {
                const statusStyle = getStatusStyle(meeting.status);
                return (
                  <tr key={meeting.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={`/dashboard/cab/${meeting.id}`}
                        style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {meeting.title}
                      </Link>
                      {meeting.location && (
                        <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                          {meeting.location}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151', fontSize: 13, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon path={mdiCalendar} size={0.7} color="#9ca3af" />
                        {formatDateTime(meeting.scheduledFor)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {meeting.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                      {meeting._count?.attendees ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                      {meeting._count?.changes ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateMeetingModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
