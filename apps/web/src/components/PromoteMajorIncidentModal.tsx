'use client';

import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickerUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

type ImpactOrUrgency = 'HIGH' | 'CRITICAL';

// ─── Shared styles (mirrors VendorModal.tsx) ──────────────────────────────────

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-secondary)',
  borderRadius: 7,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
  fontFamily: 'inherit' as const,
};

const labelStyle = {
  display: 'block',
  marginBottom: 4,
  fontSize: 13,
  fontWeight: 600 as const,
  color: 'var(--text-secondary)',
};

function userLabel(u: PickerUser): string {
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name ? `${name} (${u.email})` : u.email;
}

// ─── PromoteMajorIncidentModal ────────────────────────────────────────────────

/**
 * Modal that promotes an existing INCIDENT-type ticket to a Major Incident.
 *
 * Soft-gate UX: parent decides when to show the modal trigger; this modal
 * collects the data needed for promotion and posts it to
 * POST /api/v1/tickets/:id/major-incident. Priority is auto-bumped to CRITICAL
 * server-side, so we don't ask the user to set it.
 */
export function PromoteMajorIncidentModal({
  ticketId,
  currentUserId,
  users,
  onClose,
  onSaved,
}: {
  ticketId: string;
  currentUserId: string;
  users: PickerUser[];
  onClose: () => void;
  onSaved: (ticket: { id: string; isMajorIncident: boolean }) => void;
}) {
  const [coordinatorId, setCoordinatorId] = useState<string>(currentUserId);
  const [impact, setImpact] = useState<ImpactOrUrgency>('HIGH');
  const [urgency, setUrgency] = useState<ImpactOrUrgency>('HIGH');
  const [summary, setSummary] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default coordinator to current user if list reloads
  useEffect(() => {
    if (!coordinatorId && users.some((u) => u.id === currentUserId)) {
      setCoordinatorId(currentUserId);
    }
  }, [coordinatorId, currentUserId, users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordinatorId) {
      setError('Coordinator is required');
      return;
    }
    if (summary.trim().length === 0) {
      setError('Situation summary is required');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/major-incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          coordinatorId,
          impact,
          urgency,
          summary: summary.trim(),
          bridgeUrl: bridgeUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to declare Major Incident');
      }
      const saved = (await res.json()) as { id: string; isMajorIncident: boolean };
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to declare Major Incident');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 560,
          overflow: 'auto',
          maxHeight: '92vh',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#dc2626' }}>
            Declare Major Incident
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            This will mark the ticket as a Major Incident, set Priority to CRITICAL, and notify the
            assigned Coordinator.
          </p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Coordinator */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="mi-coordinator" style={labelStyle}>Coordinator *</label>
            <select
              id="mi-coordinator"
              value={coordinatorId}
              onChange={(e) => setCoordinatorId(e.target.value)}
              required
              style={inputStyle}
            >
              <option value="">— Select coordinator —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)}
                </option>
              ))}
            </select>
          </div>

          {/* Impact + Urgency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label htmlFor="mi-impact" style={labelStyle}>Impact *</label>
              <select
                id="mi-impact"
                value={impact}
                onChange={(e) => setImpact(e.target.value as ImpactOrUrgency)}
                style={inputStyle}
              >
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="mi-urgency" style={labelStyle}>Urgency *</label>
              <select
                id="mi-urgency"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as ImpactOrUrgency)}
                style={inputStyle}
              >
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          {/* Situation summary */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="mi-summary" style={labelStyle}>Situation summary *</label>
            <textarea
              id="mi-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              maxLength={2000}
              placeholder="What is broken, who is affected, what is the immediate plan?"
              style={{ ...inputStyle, minHeight: 96, resize: 'vertical' as const }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {summary.length} / 2000
            </div>
          </div>

          {/* Bridge URL (optional) */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="mi-bridge" style={labelStyle}>Bridge / war-room URL (optional)</label>
            <input
              id="mi-bridge"
              type="url"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              placeholder="https://meet.example.com/incident-bridge"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--badge-red-bg-subtle)',
                border: '1px solid #fecaca',
                borderRadius: 7,
                marginBottom: 14,
                color: '#dc2626',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 14,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '8px 18px',
                backgroundColor: isSaving ? '#fca5a5' : '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Declaring…' : 'Declare Major Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── DeescalateMajorIncidentModal ─────────────────────────────────────────────

/**
 * Smaller confirm-with-reason dialog for de-escalating a Major Incident
 * back to a regular ticket. Posts DELETE /api/v1/tickets/:id/major-incident.
 */
export function DeescalateMajorIncidentModal({
  ticketId,
  onClose,
  onSaved,
}: {
  ticketId: string;
  onClose: () => void;
  onSaved: (ticket: { id: string; isMajorIncident: boolean }) => void;
}) {
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length === 0) {
      setError('Reason is required');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/major-incident`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to de-escalate');
      }
      const saved = (await res.json()) as { id: string; isMajorIncident: boolean };
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to de-escalate');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 480,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            De-escalate Major Incident
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Reverts the ticket to a regular incident. The reason will be recorded as an internal
            comment on the ticket.
          </p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="mi-deescalate-reason" style={labelStyle}>Reason *</label>
            <textarea
              id="mi-deescalate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={2000}
              placeholder="Why are we de-escalating? (e.g. declared in error, scope smaller than thought)"
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }}
            />
          </div>
          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--badge-red-bg-subtle)',
                border: '1px solid #fecaca',
                borderRadius: 7,
                marginBottom: 14,
                color: '#dc2626',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '8px 16px',
                border: '1px solid var(--border-secondary)',
                borderRadius: 7,
                fontSize: 14,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '8px 18px',
                backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Saving…' : 'De-escalate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
