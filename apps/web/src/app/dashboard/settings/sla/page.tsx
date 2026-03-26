'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiClockAlert, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaPolicy {
  id: string;
  name: string;
  p1ResponseMinutes: number;
  p2ResponseMinutes: number;
  p3ResponseMinutes: number;
  p4ResponseMinutes: number;
  p1ResolutionMinutes: number;
  p2ResolutionMinutes: number;
  p3ResolutionMinutes: number;
  p4ResolutionMinutes: number;
  businessHours: boolean;
  timezone: string;
  businessStartTime: string | null;
  businessEndTime: string | null;
  businessDays: number[];
  autoEscalate: boolean;
  escalationQueueId: string | null;
  escalationQueue: { id: string; name: string } | null;
}

interface QueueOption {
  id: string;
  name: string;
}

const COMMON_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney',
];

function minutesToDisplay(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── SLA Policy Modal ─────────────────────────────────────────────────────────

function SlaPolicyModal({
  policy,
  queues,
  onClose,
  onSaved,
}: {
  policy: SlaPolicy | null;
  queues: QueueOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(policy?.name ?? '');
  const [p1Resp, setP1Resp] = useState(String(policy?.p1ResponseMinutes ?? 30));
  const [p2Resp, setP2Resp] = useState(String(policy?.p2ResponseMinutes ?? 60));
  const [p3Resp, setP3Resp] = useState(String(policy?.p3ResponseMinutes ?? 240));
  const [p4Resp, setP4Resp] = useState(String(policy?.p4ResponseMinutes ?? 480));
  const [p1Res, setP1Res] = useState(String(policy?.p1ResolutionMinutes ?? 240));
  const [p2Res, setP2Res] = useState(String(policy?.p2ResolutionMinutes ?? 480));
  const [p3Res, setP3Res] = useState(String(policy?.p3ResolutionMinutes ?? 1440));
  const [p4Res, setP4Res] = useState(String(policy?.p4ResolutionMinutes ?? 2880));
  const [businessHours, setBusinessHours] = useState(policy?.businessHours ?? false);
  const [startTime, setStartTime] = useState(policy?.businessStartTime ?? '09:00');
  const [endTime, setEndTime] = useState(policy?.businessEndTime ?? '17:00');
  const [businessDays, setBusinessDays] = useState<number[]>(policy?.businessDays ?? [1, 2, 3, 4, 5]);
  const [timezone, setTimezone] = useState(policy?.timezone ?? 'UTC');
  const [autoEscalate, setAutoEscalate] = useState(policy?.autoEscalate ?? false);
  const [escalationQueueId, setEscalationQueueId] = useState(policy?.escalationQueueId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const DAYS = [
    { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
  ];

  const toggleDay = (day: number) => {
    setBusinessDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(policy ? `/api/v1/sla/${policy.id}` : '/api/v1/sla', {
        method: policy ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          p1ResponseMinutes: Number(p1Resp),
          p2ResponseMinutes: Number(p2Resp),
          p3ResponseMinutes: Number(p3Resp),
          p4ResponseMinutes: Number(p4Resp),
          p1ResolutionMinutes: Number(p1Res),
          p2ResolutionMinutes: Number(p2Res),
          p3ResolutionMinutes: Number(p3Res),
          p4ResolutionMinutes: Number(p4Res),
          businessHours,
          timezone,
          businessStartTime: businessHours ? startTime : null,
          businessEndTime: businessHours ? endTime : null,
          businessDays: businessHours ? businessDays : [],
          autoEscalate,
          escalationQueueId: autoEscalate && escalationQueueId ? escalationQueueId : null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save SLA policy');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SLA policy');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{policy ? 'Edit SLA Policy' : 'Create SLA Policy'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Name */}
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="policyName" style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151' }}>Policy Name *</label>
            <input id="policyName" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={{ ...inputStyle, fontSize: 14 }} />
          </div>

          {/* Priority response/resolution matrix */}
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Response / Resolution Minutes</p>
          <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>Response (min)</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textAlign: 'center' }}>Resolution (min)</span>
            </div>
            {[
              { label: 'P1', resp: p1Resp, setResp: setP1Resp, res: p1Res, setRes: setP1Res, color: '#dc2626' },
              { label: 'P2', resp: p2Resp, setResp: setP2Resp, res: p2Res, setRes: setP2Res, color: '#ea580c' },
              { label: 'P3', resp: p3Resp, setResp: setP3Resp, res: p3Res, setRes: setP3Res, color: '#ca8a04' },
              { label: 'P4', resp: p4Resp, setResp: setP4Resp, res: p4Res, setRes: setP4Res, color: '#6b7280' },
            ].map((row) => (
              <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: row.color, display: 'flex', alignItems: 'center' }}>{row.label}</span>
                <input type="number" min={1} value={row.resp} onChange={(e) => row.setResp(e.target.value)} style={inputStyle} />
                <input type="number" min={1} value={row.res} onChange={(e) => row.setRes(e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Business hours */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={businessHours} onChange={(e) => setBusinessHours(e.target.checked)} />
              <span>Apply business hours</span>
            </label>
          </div>
          {businessHours && (
            <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label htmlFor="timezone" style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Timezone</label>
                  <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} style={inputStyle}>
                    {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="startTime" style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Start Time</label>
                  <input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="endTime" style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>End Time</label>
                  <input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <label style={{ display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Business Days</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {DAYS.map((day) => (
                  <label key={day.value} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '4px 6px', borderRadius: 6, border: '1px solid', borderColor: businessDays.includes(day.value) ? '#6366f1' : '#e5e7eb', backgroundColor: businessDays.includes(day.value) ? '#eef2ff' : '#fff', color: businessDays.includes(day.value) ? '#4f46e5' : '#6b7280' }}>
                    <input type="checkbox" checked={businessDays.includes(day.value)} onChange={() => toggleDay(day.value)} style={{ display: 'none' }} />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Auto-escalation — per CONTEXT.md locked decision */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={autoEscalate} onChange={(e) => setAutoEscalate(e.target.checked)} />
              <span>Auto-escalate on SLA breach</span>
            </label>
          </div>
          {autoEscalate && (
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="escalationQueue" style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151' }}>Escalation Queue</label>
              <select id="escalationQueue" value={escalationQueueId} onChange={(e) => setEscalationQueueId(e.target.value)} style={{ ...inputStyle, fontSize: 14 }}>
                <option value="">-- None --</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
          )}

          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : policy ? 'Save Changes' : 'Create Policy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SLA Settings Page ────────────────────────────────────────────────────────

export default function SlaSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editPolicy, setEditPolicy] = useState<SlaPolicy | null>(null);

  const { data, isLoading } = useQuery<SlaPolicy[]>({
    queryKey: ['settings-sla'],
    queryFn: async () => {
      const res = await fetch('/api/v1/sla', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load SLA policies');
      const json = await res.json();
      return Array.isArray(json) ? json : json.policies ?? [];
    },
  });

  const { data: queuesData } = useQuery<QueueOption[]>({
    queryKey: ['settings-queues-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const handleDelete = async (policy: SlaPolicy) => {
    if (!window.confirm(`Delete SLA policy "${policy.name}"?`)) return;
    await fetch(`/api/v1/sla/${policy.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-sla'] });
  };

  const policies = data ?? [];
  const queues = queuesData ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiClockAlert} size={1} color="#d97706" />
          SLA Policies
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditPolicy(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New SLA Policy
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading SLA policies...</div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#dc2626' }}>P1</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#ea580c' }}>P2</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#ca8a04' }}>P3</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>P4</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Biz Hours</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Auto-Escalate</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{policy.name}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>
                    {minutesToDisplay(policy.p1ResponseMinutes)} / {minutesToDisplay(policy.p1ResolutionMinutes)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>
                    {minutesToDisplay(policy.p2ResponseMinutes)} / {minutesToDisplay(policy.p2ResolutionMinutes)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>
                    {minutesToDisplay(policy.p3ResponseMinutes)} / {minutesToDisplay(policy.p3ResolutionMinutes)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280' }}>
                    {minutesToDisplay(policy.p4ResponseMinutes)} / {minutesToDisplay(policy.p4ResolutionMinutes)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, backgroundColor: policy.businessHours ? '#d1fae5' : '#f3f4f6', color: policy.businessHours ? '#065f46' : '#6b7280' }}>
                      {policy.businessHours ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, backgroundColor: policy.autoEscalate ? '#fef3c7' : '#f3f4f6', color: policy.autoEscalate ? '#92400e' : '#6b7280' }}>
                      {policy.autoEscalate ? (policy.escalationQueue?.name ?? 'Yes') : 'No'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditPolicy(policy); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />Edit
                      </button>
                      <button onClick={() => void handleDelete(policy)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}>
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No SLA policies yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <SlaPolicyModal
          policy={editPolicy}
          queues={queues}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-sla'] })}
        />
      )}
    </div>
  );
}
