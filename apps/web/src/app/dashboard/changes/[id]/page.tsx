'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiSwapHorizontal,
  mdiCheck,
  mdiClose,
  mdiAlertCircle,
  mdiClockOutline,
  mdiCheckCircle,
  mdiCloseCircle,
} from '@mdi/js';
import RichTextField from '@/components/RichTextField';
import Breadcrumb from '@/components/Breadcrumb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Approver {
  id: string;
  sequenceOrder: number;
  status: string;
  decision: string | null;
  comments: string | null;
  approver: { id: string; firstName: string; lastName: string; email: string } | null;
  decidedAt: string | null;
}

interface Activity {
  id: string;
  activityType: string;
  description: string | null;
  performedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface LinkedAsset {
  id: string;
  asset: { id: string; assetTag: string; model: string | null };
}

interface LinkedApp {
  id: string;
  application: { id: string; name: string };
}

interface ChangeDetail {
  id: string;
  changeNumber: string;
  title: string;
  type: string;
  status: string;
  riskLevel: string;
  description: string;
  implementationPlan: string | null;
  backoutPlan: string | null;
  testingPlan: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  requestedBy: { id: string; firstName: string; lastName: string } | null;
  approvals: Approver[];
  activities: Activity[];
  assets: LinkedAsset[];
  applications: LinkedApp[];
  createdAt: string;
  updatedAt: string;
}

// ─── Status Transitions ───────────────────────────────────────────────────────

// Mirrors ALLOWED_TRANSITIONS in apps/api/src/services/change.service.ts.
// APPROVAL_PENDING → APPROVED is not exposed here because approvers vote via
// the ApprovalPanel; admins should not bypass the vote.
const TRANSITIONS: Record<string, string[]> = {
  NEW:              ['ASSESSMENT', 'CANCELLED'],
  ASSESSMENT:       ['APPROVAL_PENDING', 'CANCELLED'],
  APPROVAL_PENDING: ['CANCELLED'],
  APPROVED:         ['SCHEDULED', 'CANCELLED'],
  SCHEDULED:        ['IMPLEMENTING', 'CANCELLED'],
  IMPLEMENTING:     ['REVIEW'],
  REVIEW:           ['COMPLETED', 'IMPLEMENTING'],
  REJECTED:         [],
  COMPLETED:        [],
  CANCELLED:        [],
};

const EDITABLE_IN_DRAFT = new Set(['NEW', 'ASSESSMENT']);
const RECALLABLE = new Set(['APPROVAL_PENDING', 'APPROVED', 'SCHEDULED']);
const IN_IMPLEMENTATION = new Set(['IMPLEMENTING', 'REVIEW']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'DRAFT':              return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    case 'SUBMITTED':          return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'PENDING_APPROVAL':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'APPROVED':           return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'REJECTED':           return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'SCHEDULED':          return { bg: 'var(--badge-indigo-bg)', text: '#3730a3' };
    case 'IN_PROGRESS':        return { bg: '#fef9c3', text: '#854d0e' };
    case 'COMPLETED':          return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'FAILED':             return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'CANCELLED':          return { bg: 'var(--bg-tertiary)', text: '#9ca3af' };
    default:                   return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function getRiskStyle(risk: string): { bg: string; text: string } {
  switch (risk) {
    case 'LOW':      return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'MEDIUM':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'HIGH':     return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'CRITICAL': return { bg: '#450a0a', text: '#fca5a5' };
    default:         return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Approval Panel ───────────────────────────────────────────────────────────

function ApprovalPanel({
  changeId,
  approvals,
  currentUserId,
  onApproved,
}: {
  changeId: string;
  approvals: Approver[];
  currentUserId: string | null;
  onApproved: () => void;
}) {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Find the next pending approver
  const pendingApprovals = approvals
    .filter((a) => a.status === 'PENDING')
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

  const nextApproval = pendingApprovals[0];
  const isCurrentUserApprover = nextApproval && nextApproval.approver?.id === currentUserId;

  const handleDecision = async () => {
    if (!decision) return;
    if (decision === 'REJECTED' && !comments.trim()) {
      setError('Comments required when rejecting');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/changes/${changeId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, comments: comments || undefined }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Failed: ${res.status}`);
      }
      onApproved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (approvals.length === 0) return null;

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Approval Chain</h2>

      {/* Approval chain list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: isCurrentUserApprover ? 16 : 0 }}>
        {approvals
          .slice()
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((approval) => {
            const isPending = approval.status === 'PENDING';
            const isApproved = approval.decision === 'APPROVED';
            const isRejected = approval.decision === 'REJECTED';

            return (
              <div
                key={approval.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 6,
                }}
              >
                <span style={{ width: 20, height: 20, flexShrink: 0 }}>
                  {isPending && <Icon path={mdiClockOutline} size={0.85} color="#d97706" />}
                  {isApproved && <Icon path={mdiCheckCircle} size={0.85} color="#16a34a" />}
                  {isRejected && <Icon path={mdiCloseCircle} size={0.85} color="#dc2626" />}
                </span>
                <span style={{ flex: 1, fontSize: 14, color: 'var(--text-secondary)' }}>
                  {approval.approver
                    ? `${approval.approver.firstName} ${approval.approver.lastName}`
                    : 'Unknown approver'}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 500,
                  backgroundColor: isPending ? 'var(--badge-yellow-bg)' : isApproved ? 'var(--badge-green-bg)' : 'var(--badge-red-bg)',
                  color: isPending ? '#92400e' : isApproved ? '#065f46' : '#991b1b',
                }}>
                  {isPending ? 'Pending' : (approval.decision ?? approval.status)}
                </span>
                {approval.comments && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    &quot;{approval.comments}&quot;
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {/* Approve/Reject buttons for current user */}
      {isCurrentUserApprover && (
        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 16, marginTop: 8 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Your action is required:
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              onClick={() => setDecision('APPROVED')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                backgroundColor: decision === 'APPROVED' ? '#16a34a' : 'var(--bg-primary)',
                color: decision === 'APPROVED' ? '#fff' : '#16a34a',
                border: '2px solid #16a34a',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon path={mdiCheck} size={0.8} color="currentColor" />
              Approve
            </button>
            <button
              onClick={() => setDecision('REJECTED')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                backgroundColor: decision === 'REJECTED' ? '#dc2626' : 'var(--bg-primary)',
                color: decision === 'REJECTED' ? '#fff' : '#dc2626',
                border: '2px solid #dc2626',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon path={mdiClose} size={0.8} color="currentColor" />
              Reject
            </button>
          </div>

          {decision && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Comments {decision === 'REJECTED' ? '(required)' : '(optional)'}
                </label>
                <RichTextField
                  value={comments}
                  onChange={setComments}
                  placeholder="Add comments..."
                  minHeight={60}
                  compact
                />
              </div>
              {error && <p style={{ color: 'var(--accent-danger)', fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
              <button
                onClick={() => void handleDecision()}
                disabled={submitting}
                style={{
                  padding: '8px 20px',
                  backgroundColor: decision === 'APPROVED' ? '#16a34a' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting...' : `Confirm ${decision === 'APPROVED' ? 'Approval' : 'Rejection'}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Change Detail Page ───────────────────────────────────────────────────────

interface EditForm {
  title: string;
  description: string;
  implementationPlan: string;
  backoutPlan: string;
  testingPlan: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  scheduledStart: string;
  scheduledEnd: string;
}

function toLocalInput(dt: string | null): string {
  if (!dt) return '';
  const d = new Date(dt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ChangeDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const [transitioning, setTransitioning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallReason, setRecallReason] = useState('');
  const [recalling, setRecalling] = useState(false);
  const [recallError, setRecallError] = useState<string | null>(null);
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [savingActuals, setSavingActuals] = useState(false);

  // In a real app, you'd get this from the auth session. Using a placeholder.
  const currentUserId: string | null = null;

  const { data: change, isLoading, error } = useQuery<ChangeDetail>({
    queryKey: ['change', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/changes/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load change: ${res.status}`);
      return res.json() as Promise<ChangeDetail>;
    },
  });

  const handleTransition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      const res = await fetch(`/api/v1/changes/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`Transition failed: ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ['change', id] });
    } catch {
      // silently fail — could add toast here
    } finally {
      setTransitioning(false);
    }
  };

  const handleApproved = () => {
    void queryClient.invalidateQueries({ queryKey: ['change', id] });
  };

  const handleEditStart = () => {
    if (!change) return;
    setEditForm({
      title: change.title ?? '',
      description: change.description ?? '',
      implementationPlan: change.implementationPlan ?? '',
      backoutPlan: change.backoutPlan ?? '',
      testingPlan: change.testingPlan ?? '',
      riskLevel: (change.riskLevel as EditForm['riskLevel']) ?? 'MEDIUM',
      scheduledStart: toLocalInput(change.scheduledStart),
      scheduledEnd: toLocalInput(change.scheduledEnd),
    });
    setSaveError(null);
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditForm(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editForm) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        title: editForm.title,
        description: editForm.description,
        implementationPlan: editForm.implementationPlan,
        backoutPlan: editForm.backoutPlan,
        testingPlan: editForm.testingPlan,
        riskLevel: editForm.riskLevel,
        scheduledStart: editForm.scheduledStart ? new Date(editForm.scheduledStart).toISOString() : null,
        scheduledEnd: editForm.scheduledEnd ? new Date(editForm.scheduledEnd).toISOString() : null,
      };
      const res = await fetch(`/api/v1/changes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      await queryClient.invalidateQueries({ queryKey: ['change', id] });
      setIsEditing(false);
      setEditForm(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRecall = async () => {
    setRecalling(true);
    setRecallError(null);
    try {
      const res = await fetch(`/api/v1/changes/${id}/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: recallReason }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Recall failed (${res.status})`);
      }
      await queryClient.invalidateQueries({ queryKey: ['change', id] });
      setRecallOpen(false);
      setRecallReason('');
    } catch (e) {
      setRecallError(e instanceof Error ? e.message : 'Recall failed');
    } finally {
      setRecalling(false);
    }
  };

  const handleSaveActuals = async () => {
    setSavingActuals(true);
    try {
      const body = {
        actualStart: actualStart ? new Date(actualStart).toISOString() : null,
        actualEnd: actualEnd ? new Date(actualEnd).toISOString() : null,
      };
      const res = await fetch(`/api/v1/changes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.ok) await queryClient.invalidateQueries({ queryKey: ['change', id] });
    } finally {
      setSavingActuals(false);
    }
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading change...</div>;
  }
  if (error || !change) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
      {error instanceof Error ? error.message : 'Change not found'}
    </div>;
  }

  const statusStyle = getStatusStyle(change.status);
  const riskStyle = getRiskStyle(change.riskLevel);
  const isEmergency = change.type === 'EMERGENCY';
  const allowedTransitions = TRANSITIONS[change.status] ?? [];
  const canEdit = EDITABLE_IN_DRAFT.has(change.status);
  const canRecall = RECALLABLE.has(change.status);
  const inImplementation = IN_IMPLEMENTATION.has(change.status);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Breadcrumb + Header ──────────────────────────────────────────────── */}
      <Breadcrumb items={[
        { label: 'Changes', href: '/dashboard/changes' },
        { label: `CHG-${change.changeNumber}` },
      ]} />
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={mdiSwapHorizontal} size={1} color="var(--accent-primary)" />
              {change.title}
            </h1>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>CHG-{change.changeNumber}</span>
              {isEmergency && (
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 700, backgroundColor: 'var(--badge-red-bg)', color: '#991b1b' }}>
                  EMERGENCY
                </span>
              )}
              {!isEmergency && (
                <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: '#374151' }}>
                  {change.type}
                </span>
              )}
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {change.status.replace(/_/g, ' ')}
              </span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 500, backgroundColor: riskStyle.bg, color: riskStyle.text }}>
                {change.riskLevel} RISK
              </span>
            </div>
          </div>

          {/* Action buttons: Edit (draft), Recall (post-submit), transitions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {canEdit && !isEditing && (
              <button
                onClick={handleEditStart}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
            )}
            {canRecall && (
              <button
                onClick={() => setRecallOpen(true)}
                title="Pull this change back to ASSESSMENT so it can be corrected. Approvals will be cleared."
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'var(--bg-primary)',
                  color: '#b45309',
                  border: '1px solid #f59e0b',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Recall to Assessment
              </button>
            )}
            {allowedTransitions.length > 0 && (
              <>
              {allowedTransitions.map((nextStatus) => {
                const isDanger = nextStatus === 'CANCELLED' || nextStatus === 'FAILED';
                return (
                  <button
                    key={nextStatus}
                    onClick={() => void handleTransition(nextStatus)}
                    disabled={transitioning}
                    style={{
                      padding: '7px 14px',
                      backgroundColor: isDanger ? 'var(--bg-primary)' : 'var(--accent-primary)',
                      color: isDanger ? 'var(--accent-danger)' : '#fff',
                      border: isDanger ? '1px solid var(--accent-danger)' : 'none',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: transitioning ? 'not-allowed' : 'pointer',
                      opacity: transitioning ? 0.6 : 1,
                    }}
                  >
                    {nextStatus.replace(/_/g, ' ')}
                  </button>
                );
              })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Recall Modal ──────────────────────────────────────────────────────── */}
      {recallOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }}>
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 10, padding: 24, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
              Recall change to Assessment
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This pulls CHG-{change.changeNumber} back to <strong>ASSESSMENT</strong>. Existing approval decisions are
              cleared so the corrected change must be re-approved. A reason is required and logged in the audit trail.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Reason for recall
            </label>
            <textarea
              value={recallReason}
              onChange={(e) => setRecallReason(e.target.value)}
              rows={4}
              placeholder="e.g. Backout plan missing SQL rollback step; need to revise before approval."
              style={{
                width: '100%', padding: '8px 10px',
                border: '1px solid var(--border-secondary)', borderRadius: 7,
                fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {recallError && (
              <div style={{ marginTop: 10, padding: '6px 10px', fontSize: 13, color: '#991b1b', backgroundColor: 'var(--badge-red-bg)', borderRadius: 6 }}>
                {recallError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => { setRecallOpen(false); setRecallReason(''); setRecallError(null); }}
                disabled={recalling}
                style={{ padding: '7px 14px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: recalling ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRecall()}
                disabled={recalling || recallReason.trim().length < 3}
                style={{ padding: '7px 14px', backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: (recalling || recallReason.trim().length < 3) ? 'not-allowed' : 'pointer', opacity: (recalling || recallReason.trim().length < 3) ? 0.6 : 1 }}
              >
                {recalling ? 'Recalling…' : 'Recall Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Approval Panel (CONTEXT.md: shown at top) ──────────────────── */}
      {change.approvals.length > 0 && (
        <ApprovalPanel
          changeId={id}
          approvals={change.approvals}
          currentUserId={currentUserId}
          onApproved={handleApproved}
        />
      )}

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

        {/* Left: Description + Plans (or Edit Form when editing) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isEditing && editForm ? (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Edit Change</h2>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Implementation Plan</label>
                <textarea
                  value={editForm.implementationPlan}
                  onChange={(e) => setEditForm({ ...editForm, implementationPlan: e.target.value })}
                  rows={5}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Backout Plan</label>
                <textarea
                  value={editForm.backoutPlan}
                  onChange={(e) => setEditForm({ ...editForm, backoutPlan: e.target.value })}
                  rows={4}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Testing Plan</label>
                <textarea
                  value={editForm.testingPlan}
                  onChange={(e) => setEditForm({ ...editForm, testingPlan: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Risk Level</label>
                  <select
                    value={editForm.riskLevel}
                    onChange={(e) => setEditForm({ ...editForm, riskLevel: e.target.value as EditForm['riskLevel'] })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Scheduled Start</label>
                  <input
                    type="datetime-local"
                    value={editForm.scheduledStart}
                    onChange={(e) => setEditForm({ ...editForm, scheduledStart: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Scheduled End</label>
                  <input
                    type="datetime-local"
                    value={editForm.scheduledEnd}
                    onChange={(e) => setEditForm({ ...editForm, scheduledEnd: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              {saveError && (
                <div style={{ padding: '8px 12px', fontSize: 13, color: '#991b1b', backgroundColor: 'var(--badge-red-bg)', borderRadius: 6 }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={handleEditCancel}
                  disabled={saving}
                  style={{ padding: '8px 16px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={{ padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <>
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Description</h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{change.description}</p>
          </div>

          {change.implementationPlan && (
            <details open style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10 }}>
              <summary style={{ padding: '14px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                Implementation Plan
              </summary>
              <div style={{ padding: '0 20px 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{change.implementationPlan}</p>
              </div>
            </details>
          )}

          {change.backoutPlan && (
            <details style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10 }}>
              <summary style={{ padding: '14px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                Backout Plan
              </summary>
              <div style={{ padding: '0 20px 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{change.backoutPlan}</p>
              </div>
            </details>
          )}

          {change.testingPlan && (
            <details style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10 }}>
              <summary style={{ padding: '14px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                Testing Plan
              </summary>
              <div style={{ padding: '0 20px 20px' }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{change.testingPlan}</p>
              </div>
            </details>
          )}
            </>
          )}
        </div>

        {/* Right: Info + Schedule + Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Info */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Details</h2>
            {[
              ['Requested By', change.requestedBy ? `${change.requestedBy.firstName} ${change.requestedBy.lastName}` : null],
              ['Created', formatDateTime(change.createdAt)],
              ['Updated', formatDateTime(change.updatedAt)],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>{(value as string | null) ?? '—'}</span>
              </div>
            ))}
          </div>

          {/* Schedule */}
          {(change.scheduledStart || change.scheduledEnd) && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Schedule</h2>
              <div style={{ fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Start</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatDateTime(change.scheduledStart)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span style={{ color: 'var(--text-muted)' }}>End</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatDateTime(change.scheduledEnd)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Implementation Actuals — only editable during IMPLEMENTING/REVIEW.
              Plan/backout fields are locked after approval per ITIL. */}
          {inImplementation && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Implementation Actuals</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Actual Start</label>
                  <input
                    type="datetime-local"
                    value={actualStart || toLocalInput(change.actualStart)}
                    onChange={(e) => setActualStart(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Actual End</label>
                  <input
                    type="datetime-local"
                    value={actualEnd || toLocalInput(change.actualEnd)}
                    onChange={(e) => setActualEnd(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  onClick={() => void handleSaveActuals()}
                  disabled={savingActuals}
                  style={{ padding: '7px 12px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: savingActuals ? 'not-allowed' : 'pointer', opacity: savingActuals ? 0.6 : 1 }}
                >
                  {savingActuals ? 'Saving…' : 'Save Actuals'}
                </button>
              </div>
            </div>
          )}

          {/* Linked Assets */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Linked Assets ({change.assets.length})</h2>
            {change.assets.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>No assets linked</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {change.assets.map((la) => (
                  <Link
                    key={la.id}
                    href={`/dashboard/assets/${la.asset.id}`}
                    style={{ fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none' }}
                  >
                    {la.asset.assetTag} {la.asset.model ? `— ${la.asset.model}` : ''}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Linked Applications */}
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Linked Applications ({change.applications.length})</h2>
            {change.applications.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)' }}>No applications linked</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {change.applications.map((la) => (
                  <span key={la.id} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {la.application.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Activity Trail ─────────────────────────────────────────────────────── */}
      {change.activities.length > 0 && (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20, marginTop: 16 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Activity Trail</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {change.activities.map((activity, idx) => (
              <div
                key={activity.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: idx < change.activities.length - 1 ? '1px solid var(--bg-tertiary)' : 'none',
                }}
              >
                <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent-primary)', marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {activity.activityType.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(activity.createdAt)}
                    </span>
                  </div>
                  {activity.description && (
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{activity.description}</p>
                  )}
                  {activity.performedBy && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
                      by {activity.performedBy.firstName} {activity.performedBy.lastName}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
