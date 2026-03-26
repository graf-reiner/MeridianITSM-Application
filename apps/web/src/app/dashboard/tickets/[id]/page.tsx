'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiPaperclip, mdiSend, mdiAccountCircle, mdiClockOutline } from '@mdi/js';
import SlaCountdown from '../../../../components/SlaCountdown';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketDetail {
  id: string;
  ticketNumber: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  assignee: { id: string; firstName: string; lastName: string } | null;
  requester: { id: string; firstName: string; lastName: string; email: string } | null;
  category: { id: string; name: string } | null;
  queue: { id: string; name: string } | null;
  slaPolicy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  customFields: Record<string, unknown> | null;
}

interface Comment {
  id: string;
  body: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  author: { firstName: string; lastName: string } | null;
  createdAt: string;
  timeSpentMinutes: number | null;
}

interface Activity {
  id: string;
  action: string;
  actor: { firstName: string; lastName: string } | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
}

interface SlaStatus {
  slaBreachAt: string | null;
  isPaused: boolean;
  elapsedPercentage: number;
  pauseReason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(s: string) {
  switch (s) {
    case 'NEW': return { bg: '#dbeafe', text: '#1e40af' };
    case 'OPEN': return { bg: '#d1fae5', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: '#fef3c7', text: '#92400e' };
    case 'PENDING': return { bg: '#ffedd5', text: '#9a3412' };
    case 'RESOLVED': return { bg: '#f3f4f6', text: '#374151' };
    case 'CLOSED': return { bg: '#f3f4f6', text: '#6b7280' };
    case 'CANCELLED': return { bg: '#fee2e2', text: '#991b1b' };
    default: return { bg: '#f3f4f6', text: '#374151' };
  }
}

function getPriorityStyle(p: string) {
  switch (p) {
    case 'CRITICAL': return { bg: '#fee2e2', text: '#991b1b' };
    case 'HIGH': return { bg: '#ffedd5', text: '#9a3412' };
    case 'MEDIUM': return { bg: '#fef3c7', text: '#92400e' };
    case 'LOW': return { bg: '#f3f4f6', text: '#374151' };
    default: return { bg: '#f3f4f6', text: '#374151' };
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'PENDING', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['PENDING', 'RESOLVED', 'CANCELLED'],
  PENDING: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: [],
  CANCELLED: [],
};

// ─── Ticket Detail Page ───────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const ticketId = params.id as string;
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'attachments'>('comments');
  const [commentBody, setCommentBody] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [fieldUpdating, setFieldUpdating] = useState<string | null>(null);

  const { data: ticket, isLoading, error } = useQuery<TicketDetail>({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load ticket');
      const data = await res.json();
      // API may return ticket directly or wrapped in { ticket: ... }
      return (data.ticket ?? data) as TicketDetail;
    },
  });

  const { data: slaStatus } = useQuery<SlaStatus>({
    queryKey: ['ticket-sla', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/sla-status`, { credentials: 'include' });
      if (!res.ok) return { slaBreachAt: null, isPaused: false, elapsedPercentage: 0 };
      return res.json() as Promise<SlaStatus>;
    },
    enabled: !!ticket?.slaPolicy,
  });

  const { data: commentsData } = useQuery<{ comments: Comment[] }>({
    queryKey: ['ticket-comments', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/comments`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load comments');
      return res.json() as Promise<{ comments: Comment[] }>;
    },
    enabled: activeTab === 'comments',
  });

  const { data: activitiesData } = useQuery<{ activities: Activity[] }>({
    queryKey: ['ticket-activities', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/activities`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load activities');
      return res.json() as Promise<{ activities: Activity[] }>;
    },
    enabled: activeTab === 'activity',
  });

  const { data: attachmentsData } = useQuery<{ attachments: Array<{ id: string; filename: string; size: number; createdAt: string }> }>({
    queryKey: ['ticket-attachments', ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/tickets/${ticketId}/attachments`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load attachments');
      return res.json() as Promise<{ attachments: Array<{ id: string; filename: string; size: number; createdAt: string }> }>;
    },
    enabled: activeTab === 'attachments',
  });

  // ── Dropdown options for editable sidebar fields ──────────────────────────
  const { data: usersData } = useQuery<Array<{ id: string; firstName: string; lastName: string }>>({
    queryKey: ['users-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      const list = json.data ?? json.users ?? (Array.isArray(json) ? json : []);
      return list;
    },
  });

  const { data: queuesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['queues-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/queues', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.queues ?? [];
    },
  });

  const { data: categoriesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['categories-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.categories ?? [];
    },
  });

  const { data: slaPoliciesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['sla-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/sla', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.policies ?? [];
    },
  });

  const handleFieldUpdate = async (field: string, value: string | null) => {
    setFieldUpdating(field);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) throw new Error('Failed to update');
      void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    } catch {
      // silently fail — will show stale data
    } finally {
      setFieldUpdating(null);
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ticket', ticketId] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const handleStatusChange = async (newStatus: string) => {
    setStatusUpdating(true);
    try {
      await updateStatusMutation.mutateAsync(newStatus);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: commentBody.trim(), visibility: commentVisibility }),
      });
      if (!res.ok) throw new Error('Failed to post comment');
      setCommentBody('');
      void qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading ticket...</div>;
  if (error || !ticket) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
        {error instanceof Error ? error.message : 'Ticket not found'}
        <div style={{ marginTop: 16 }}>
          <Link href="/dashboard/tickets" style={{ color: '#4f46e5', textDecoration: 'none' }}>Back to tickets</Link>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(ticket.status);
  const priorityStyle = getPriorityStyle(ticket.priority);
  const transitions = STATUS_TRANSITIONS[ticket.status] ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Back link ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard/tickets" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280', textDecoration: 'none', fontSize: 14 }}>
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to tickets
        </Link>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>{ticket.ticketNumber}</span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {ticket.status.replace(/_/g, ' ')}
              </span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: priorityStyle.bg, color: priorityStyle.text }}>
                {ticket.priority}
              </span>
              {slaStatus && (
                <SlaCountdown
                  slaBreachAt={slaStatus.slaBreachAt}
                  isPaused={slaStatus.isPaused}
                  elapsedPercentage={slaStatus.elapsedPercentage}
                  pauseReason={slaStatus.pauseReason}
                />
              )}
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#111827' }}>{ticket.title}</h1>
            {ticket.description && (
              <p style={{ margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{ticket.description}</p>
            )}
          </div>

          {/* Status change */}
          {transitions.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <select
                onChange={(e) => { if (e.target.value) void handleStatusChange(e.target.value); e.target.value = ''; }}
                disabled={statusUpdating}
                defaultValue=""
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: '#fff' }}
              >
                <option value="" disabled>Change status...</option>
                {transitions.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Content grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* ── Tabs ────────────────────────────────────────────────────────────── */}
        <div>
          {/* Tab Bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16, backgroundColor: '#fff', borderRadius: '12px 12px 0 0', border: '1px solid #e5e7eb', borderBottomColor: 'transparent' }}>
            {(['comments', 'activity', 'attachments'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? '#4f46e5' : '#6b7280',
                  borderBottom: activeTab === tab ? '2px solid #4f46e5' : '2px solid transparent',
                  marginBottom: -1,
                  textTransform: 'capitalize',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', padding: 20 }}>

            {/* Comments */}
            {activeTab === 'comments' && (
              <div>
                {/* Comment list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  {(commentsData?.comments ?? []).length === 0 && (
                    <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>No comments yet.</p>
                  )}
                  {(commentsData?.comments ?? []).map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: '12px 14px',
                        backgroundColor: comment.visibility === 'INTERNAL' ? '#fffbeb' : '#f9fafb',
                        border: `1px solid ${comment.visibility === 'INTERNAL' ? '#fde68a' : '#f3f4f6'}`,
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Icon path={mdiAccountCircle} size={0.75} color="#9ca3af" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                          {comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : 'Unknown'}
                        </span>
                        {comment.visibility === 'INTERNAL' && (
                          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, backgroundColor: '#fde68a', color: '#92400e', textTransform: 'uppercase' }}>
                            Internal
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{comment.body}</p>
                      {comment.timeSpentMinutes != null && comment.timeSpentMinutes > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: '#9ca3af' }}>
                          <Icon path={mdiClockOutline} size={0.6} color="currentColor" />
                          {comment.timeSpentMinutes} min
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Comment form */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment..."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontSize: 14,
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                    <select
                      value={commentVisibility}
                      onChange={(e) => setCommentVisibility(e.target.value as 'PUBLIC' | 'INTERNAL')}
                      style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: '#fff' }}
                    >
                      <option value="PUBLIC">Public</option>
                      <option value="INTERNAL">Internal</option>
                    </select>
                    <button
                      onClick={() => void handleAddComment()}
                      disabled={commentSubmitting || !commentBody.trim()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 16px',
                        backgroundColor: commentSubmitting || !commentBody.trim() ? '#a5b4fc' : '#4f46e5',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: commentSubmitting || !commentBody.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Icon path={mdiSend} size={0.75} color="currentColor" />
                      {commentSubmitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                  {commentError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{commentError}</p>}
                </div>
              </div>
            )}

            {/* Activity */}
            {activeTab === 'activity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(activitiesData?.activities ?? []).length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>No activity yet.</p>
                ) : (
                  (activitiesData?.activities ?? []).map((act) => (
                    <div key={act.id} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                      <span style={{ color: '#9ca3af', flexShrink: 0 }}>{formatDate(act.createdAt)}</span>
                      <span style={{ color: '#374151' }}>
                        <strong>{act.actor ? `${act.actor.firstName} ${act.actor.lastName}` : 'System'}</strong>
                        {' — '}{act.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Attachments */}
            {activeTab === 'attachments' && (
              <div>
                {(attachmentsData?.attachments ?? []).length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>No attachments yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(attachmentsData?.attachments ?? []).map((att) => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 8 }}>
                        <Icon path={mdiPaperclip} size={0.75} color="#9ca3af" />
                        <a
                          href={`/api/v1/tickets/${ticketId}/attachments/${att.id}/url`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ flex: 1, color: '#4f46e5', fontSize: 13, textDecoration: 'none' }}
                        >
                          {att.filename}
                        </a>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{Math.round(att.size / 1024)} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {/* Assignee — editable */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Assignee</span>
                <select
                  value={ticket.assignee?.id ?? ''}
                  onChange={(e) => void handleFieldUpdate('assignedToId', e.target.value)}
                  disabled={fieldUpdating === 'assignedToId'}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="">Unassigned</option>
                  {(usersData ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>

              {/* Requester — read-only */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Requester</span>
                <span style={{ color: '#374151', fontWeight: 500 }}>
                  {ticket.requester ? `${ticket.requester.firstName} ${ticket.requester.lastName}` : '—'}
                </span>
              </div>

              {/* Queue — editable */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Queue</span>
                <select
                  value={ticket.queue?.id ?? ''}
                  onChange={(e) => void handleFieldUpdate('queueId', e.target.value)}
                  disabled={fieldUpdating === 'queueId'}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(queuesData ?? []).map((q) => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>

              {/* Category — editable */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Category</span>
                <select
                  value={ticket.category?.id ?? ''}
                  onChange={(e) => void handleFieldUpdate('categoryId', e.target.value)}
                  disabled={fieldUpdating === 'categoryId'}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(categoriesData ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* SLA Policy — editable */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>SLA Policy</span>
                <select
                  value={ticket.slaPolicy?.id ?? ''}
                  onChange={(e) => void handleFieldUpdate('slaPolicyId', e.target.value)}
                  disabled={fieldUpdating === 'slaPolicyId'}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="">— None —</option>
                  {(slaPoliciesData ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Priority — editable */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Priority</span>
                <select
                  value={ticket.priority}
                  onChange={(e) => void handleFieldUpdate('priority', e.target.value)}
                  disabled={fieldUpdating === 'priority'}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              {/* Type — editable */}
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Type</span>
                <select
                  value={ticket.type}
                  onChange={(e) => void handleFieldUpdate('type', e.target.value)}
                  disabled={fieldUpdating === 'type'}
                  style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="INCIDENT">Incident</option>
                  <option value="SERVICE_REQUEST">Service Request</option>
                  <option value="PROBLEM">Problem</option>
                  <option value="CHANGE">Change</option>
                </select>
              </div>

              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Created</span>
                <span style={{ color: '#374151' }}>{formatDate(ticket.createdAt)}</span>
              </div>
              <div>
                <span style={{ color: '#9ca3af', display: 'block', marginBottom: 2 }}>Updated</span>
                <span style={{ color: '#374151' }}>{formatDate(ticket.updatedAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
