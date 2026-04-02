'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ownerFetch } from '../../../../lib/api';

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  plan: string;
  maxUsers: number;
  maxAgents: number;
  maxSites: number;
  createdAt: string;
  suspendedAt?: string | null;
  trialEndsAt?: string | null;
}

interface Subscription {
  id: string;
  status: string;
  trialStart?: string | null;
  trialEnd?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  plan?: {
    name: string;
    displayName: string;
    monthlyPriceUsd: number;
  } | null;
}

interface UsageSnapshot {
  activeUsers: number;
  activeAgents: number;
  snapshotDate: string;
}

interface Note {
  id: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
  ownerUser?: { id: string; email: string };
}

interface TenantDetailResponse {
  tenant: TenantDetail;
  subscription: Subscription | null;
  usage: UsageSnapshot | null;
  userCount: number;
  noteCount: number;
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
        <span>{label}</span>
        <span>{value} / {max}</span>
      </div>
      <div style={{ backgroundColor: '#e5e7eb', borderRadius: '9999px', height: '8px' }}>
        <div
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            borderRadius: '9999px',
            height: '8px',
            transition: 'width 0.3s',
          }}
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '20px',
      }}
    >
      <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '16px', marginTop: 0 }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '14px' }}>
      <span style={{ color: '#6b7280', minWidth: '180px' }}>{label}:</span>
      <span style={{ color: '#111827', fontWeight: '500' }}>{value}</span>
    </div>
  );
}

const btnBase = {
  padding: '8px 14px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: '500' as const,
  cursor: 'pointer',
  border: '1px solid transparent',
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TenantDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [notePrivate, setNotePrivate] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ownerFetch(`/api/tenants/${id}`);
      const json = (await r.json()) as TenantDetailResponse;
      setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const r = await ownerFetch(`/api/tenants/${id}/notes`);
      const json = (await r.json()) as { notes: Note[] };
      setNotes(json.notes ?? []);
    } catch {
      // ignore
    } finally {
      setNotesLoading(false);
    }
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void fetchData();
    void fetchNotes();
  }, [fetchData, fetchNotes]);

  const handleLifecycle = async (action: string, params?: Record<string, unknown>) => {
    setConfirmAction(null);
    setActionLoading(true);
    setMessage(null);
    try {
      const r = await ownerFetch(`/api/tenants/${id}/lifecycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params }),
      });
      if (!r.ok) {
        const err = (await r.json()) as { error?: string };
        throw new Error(err.error ?? 'Action failed');
      }
      setMessage({ type: 'success', text: `Action '${action}' completed successfully` });
      void fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleImpersonate = async () => {
    try {
      const r = await ownerFetch(`/api/tenants/${id}/impersonate`, {
        method: 'POST',
      });
      if (!r.ok) throw new Error('Impersonation failed');
      const json = (await r.json()) as { impersonationToken: string; tenantSlug: string };
      const impersonateUrl = `http://${json.tenantSlug}.localhost:3000?impersonation_token=${json.impersonationToken}`;
      window.open(impersonateUrl, '_blank');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Impersonation failed' });
    }
  };

  const handleAddNote = async () => {
    if (!noteInput.trim()) return;
    try {
      const r = await ownerFetch(`/api/tenants/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteInput.trim(), isPrivate: notePrivate }),
      });
      if (!r.ok) throw new Error('Failed to add note');
      setNoteInput('');
      setNotePrivate(false);
      void fetchNotes();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add note' });
    }
  };

  if (loading) {
    return <div style={{ color: '#6b7280', padding: '48px', textAlign: 'center' }}>Loading tenant...</div>;
  }

  if (!data?.tenant) {
    return <div style={{ color: '#ef4444', padding: '48px', textAlign: 'center' }}>Tenant not found</div>;
  }

  const { tenant, subscription, usage } = data;

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>{tenant.name}</h1>
          <span style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>{tenant.slug}</span>
        </div>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '13px',
            fontWeight: '600',
            backgroundColor: tenant.status === 'ACTIVE' ? '#d1fae5' : tenant.status === 'SUSPENDED' ? '#fee2e2' : '#f3f4f6',
            color: tenant.status === 'ACTIVE' ? '#065f46' : tenant.status === 'SUSPENDED' ? '#991b1b' : '#374151',
          }}
        >
          {tenant.status}
        </span>
      </div>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            backgroundColor: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            fontSize: '13px',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Overview */}
      <Section title="Overview">
        <Field label="Type" value={tenant.type} />
        <Field label="Plan" value={tenant.plan} />
        <Field label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
        {tenant.suspendedAt && <Field label="Suspended At" value={new Date(tenant.suspendedAt).toLocaleString()} />}
        <Field label="Users" value={`${data.userCount} registered`} />
        <Field label="Notes" value={`${data.noteCount} internal notes`} />
      </Section>

      {/* Subscription */}
      {subscription && (
        <Section title="Subscription">
          <Field label="Plan" value={subscription.plan?.displayName ?? subscription.plan?.name ?? 'Unknown'} />
          <Field label="Status" value={subscription.status} />
          <Field label="Monthly Price" value={subscription.plan ? `$${subscription.plan.monthlyPriceUsd}/mo` : '—'} />
          {subscription.trialStart && <Field label="Trial Start" value={new Date(subscription.trialStart).toLocaleDateString()} />}
          {subscription.trialEnd && <Field label="Trial End" value={new Date(subscription.trialEnd).toLocaleDateString()} />}
          {subscription.currentPeriodStart && <Field label="Period Start" value={new Date(subscription.currentPeriodStart).toLocaleDateString()} />}
          {subscription.currentPeriodEnd && <Field label="Period End" value={new Date(subscription.currentPeriodEnd).toLocaleDateString()} />}
          <Field label="Cancel at Period End" value={subscription.cancelAtPeriodEnd ? 'Yes' : 'No'} />
        </Section>
      )}

      {/* Usage vs Limits */}
      <Section title="Usage vs Limits">
        <ProgressBar
          label="Users"
          value={usage?.activeUsers ?? data.userCount}
          max={tenant.maxUsers}
        />
        <ProgressBar
          label="Agents"
          value={usage?.activeAgents ?? 0}
          max={tenant.maxAgents || 1}
        />
        {usage && (
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
            Snapshot: {new Date(usage.snapshotDate).toLocaleDateString()}
          </div>
        )}
      </Section>

      {/* Lifecycle Actions */}
      <Section title="Lifecycle Actions">
        {confirmAction && (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#92400e', marginBottom: '12px', fontWeight: '500' }}>
              Confirm action: <strong>{confirmAction}</strong>
            </div>
            {confirmAction === 'extend_trial' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '13px', color: '#6b7280' }}>
                  Days to extend:{' '}
                  <input
                    type="number"
                    value={extendDays}
                    onChange={(e) => setExtendDays(Number(e.target.value))}
                    min={1}
                    max={90}
                    style={{ width: '70px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  const params = confirmAction === 'extend_trial' ? { days: extendDays } : undefined;
                  void handleLifecycle(confirmAction, params);
                }}
                disabled={actionLoading}
                style={{ ...btnBase, backgroundColor: '#dc2626', color: '#fff' }}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                style={{ ...btnBase, backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setConfirmAction('suspend')}
            disabled={tenant.status === 'SUSPENDED' || actionLoading}
            style={{
              ...btnBase,
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              opacity: tenant.status === 'SUSPENDED' ? 0.5 : 1,
            }}
          >
            Suspend
          </button>
          <button
            onClick={() => setConfirmAction('unsuspend')}
            disabled={tenant.status !== 'SUSPENDED' || actionLoading}
            style={{
              ...btnBase,
              backgroundColor: '#d1fae5',
              color: '#065f46',
              opacity: tenant.status !== 'SUSPENDED' ? 0.5 : 1,
            }}
          >
            Unsuspend
          </button>
          <button
            onClick={() => setConfirmAction('extend_trial')}
            disabled={actionLoading}
            style={{ ...btnBase, backgroundColor: '#ede9fe', color: '#5b21b6' }}
          >
            Extend Trial
          </button>
          <button
            onClick={() => setConfirmAction('apply_grace_period')}
            disabled={actionLoading}
            style={{ ...btnBase, backgroundColor: '#dbeafe', color: '#1e40af' }}
          >
            Apply Grace Period
          </button>
          <button
            onClick={() => setConfirmAction('delete')}
            disabled={tenant.status === 'DELETED' || actionLoading}
            style={{
              ...btnBase,
              backgroundColor: '#1f2937',
              color: '#fff',
              opacity: tenant.status === 'DELETED' ? 0.5 : 1,
            }}
          >
            Delete (Soft)
          </button>
        </div>
      </Section>

      {/* Impersonation */}
      <Section title="Impersonation">
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', marginTop: 0 }}>
          Generate a 15-minute impersonation token to access this tenant&apos;s environment as a read-only admin.
        </p>
        <button
          onClick={() => void handleImpersonate()}
          style={{ ...btnBase, backgroundColor: '#4f46e5', color: '#fff' }}
        >
          Impersonate Tenant
        </button>
      </Section>

      {/* Internal Notes */}
      <Section title="Internal Notes">
        {/* Add note form */}
        <div style={{ marginBottom: '20px' }}>
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add an internal note..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <label style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={notePrivate}
                onChange={(e) => setNotePrivate(e.target.checked)}
              />
              Private note
            </label>
            <button
              onClick={() => void handleAddNote()}
              disabled={!noteInput.trim()}
              style={{
                ...btnBase,
                backgroundColor: '#4f46e5',
                color: '#fff',
                opacity: noteInput.trim() ? 1 : 0.5,
              }}
            >
              Add Note
            </button>
          </div>
        </div>

        {/* Notes list */}
        {notesLoading ? (
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>Loading notes...</div>
        ) : notes.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>No notes yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: '12px',
                  backgroundColor: note.isPrivate ? '#fffbeb' : '#f9fafb',
                  border: `1px solid ${note.isPrivate ? '#fde68a' : '#e5e7eb'}`,
                  borderRadius: '6px',
                }}
              >
                <div style={{ fontSize: '14px', color: '#374151', whiteSpace: 'pre-wrap' }}>{note.content}</div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                  {note.ownerUser?.email ?? 'Unknown'} &bull; {new Date(note.createdAt).toLocaleString()}
                  {note.isPrivate && (
                    <span style={{ marginLeft: '8px', color: '#d97706', fontWeight: '500' }}>Private</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
