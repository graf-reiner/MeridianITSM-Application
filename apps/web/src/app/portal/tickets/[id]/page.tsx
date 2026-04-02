'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiChevronLeft,
  mdiAttachment,
  mdiSend,
  mdiCheckCircleOutline,
  mdiAlertCircleOutline,
  mdiCloseCircleOutline,
  mdiInformationOutline,
  mdiDownload,
} from '@mdi/js';
import RichTextField from '@/components/RichTextField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  category?: { name: string } | null;
  requestedBy?: { firstName: string; lastName: string; email: string } | null;
}

interface Comment {
  id: string;
  body: string;
  visibility: string;
  createdAt: string;
  author?: { firstName: string; lastName: string } | null;
}

interface Attachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

interface SlaStatus {
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'BREACHED' | 'PAUSED';
  targetHours?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'NEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'OPEN': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'PENDING': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'RESOLVED': return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
    case 'CLOSED': return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
    case 'CANCELLED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default: return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── SLA Indicator ────────────────────────────────────────────────────────────

function SlaIndicator({ slaStatus }: { slaStatus: SlaStatus | null }) {
  if (!slaStatus) return null;

  let icon = mdiCheckCircleOutline;
  let color = '#16a34a';
  let bg = 'var(--badge-green-bg)';
  let message = 'We aim to respond on time';

  if (slaStatus.status === 'WARNING') {
    icon = mdiAlertCircleOutline;
    color = 'var(--accent-warning)';
    bg = 'var(--badge-yellow-bg)';
    message = 'Response time approaching deadline';
  } else if (slaStatus.status === 'CRITICAL') {
    icon = mdiAlertCircleOutline;
    color = 'var(--accent-danger)';
    bg = 'var(--badge-red-bg)';
    message = 'Response time near limit';
  } else if (slaStatus.status === 'BREACHED') {
    icon = mdiCloseCircleOutline;
    color = 'var(--accent-danger)';
    bg = 'var(--badge-red-bg)';
    message = 'Response time exceeded';
  } else if (slaStatus.status === 'PAUSED') {
    icon = mdiInformationOutline;
    color = 'var(--text-muted)';
    bg = 'var(--bg-tertiary)';
    message = 'SLA paused — awaiting your response';
  }

  const targetText =
    slaStatus.targetHours != null
      ? `We aim to respond within ${slaStatus.targetHours} hour${slaStatus.targetHours !== 1 ? 's' : ''}.`
      : 'We aim to respond as quickly as possible.';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        backgroundColor: bg,
        borderRadius: 8,
        border: `1px solid ${color}33`,
        marginBottom: 20,
      }}
    >
      <Icon path={icon} size={0.9} color={color} />
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color }}>{message}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{targetText}</p>
      </div>
    </div>
  );
}

// ─── Ticket Detail Page ───────────────────────────────────────────────────────

export default function PortalTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [slaStatus, setSlaStatus] = useState<SlaStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      setIsLoading(true);
      setError(null);
      try {
        const [ticketRes, commentsRes, attachmentsRes, slaRes] = await Promise.allSettled([
          fetch(`/api/v1/tickets/${id}`, { credentials: 'include' }),
          fetch(`/api/v1/tickets/${id}/comments`, { credentials: 'include' }),
          fetch(`/api/v1/tickets/${id}/attachments`, { credentials: 'include' }),
          fetch(`/api/v1/tickets/${id}/sla-status`, { credentials: 'include' }),
        ]);

        if (ticketRes.status === 'fulfilled' && ticketRes.value.ok) {
          const data = (await ticketRes.value.json()) as Ticket;
          setTicket(data);
        } else {
          throw new Error('Failed to load ticket');
        }

        if (commentsRes.status === 'fulfilled' && commentsRes.value.ok) {
          const data = (await commentsRes.value.json()) as { comments: Comment[] };
          // Show only PUBLIC comments per portal policy
          const publicComments = (data.comments ?? []).filter((c) => c.visibility === 'PUBLIC');
          setComments(publicComments);
        }

        if (attachmentsRes.status === 'fulfilled' && attachmentsRes.value.ok) {
          const data = (await attachmentsRes.value.json()) as { attachments: Attachment[] };
          setAttachments(data.attachments ?? []);
        }

        if (slaRes.status === 'fulfilled' && slaRes.value.ok) {
          const data = (await slaRes.value.json()) as SlaStatus;
          setSlaStatus(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ticket');
      } finally {
        setIsLoading(false);
      }
    }
    void fetchAll();
  }, [id]);

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/v1/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          body: commentBody.trim(),
          visibility: 'PUBLIC', // End users always post PUBLIC comments
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to add comment');
      }
      const newComment = (await res.json()) as Comment;
      if (newComment.visibility === 'PUBLIC') {
        setComments((prev) => [...prev, newComment]);
      }
      setCommentBody('');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading ticket...
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <p style={{ color: 'var(--accent-danger)' }}>{error ?? 'Ticket not found'}</p>
        <Link href="/portal/tickets" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 14 }}>
          Back to My Tickets
        </Link>
      </div>
    );
  }

  const statusStyle = getStatusStyle(ticket.status);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Back Link ─────────────────────────────────────────────────────────── */}
      <Link
        href="/portal/tickets"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        <Icon path={mdiChevronLeft} size={0.8} color="currentColor" />
        Back to My Tickets
      </Link>

      {/* ── Ticket Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-placeholder)', fontFamily: 'monospace' }}>
              {ticket.ticketNumber}
            </p>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {ticket.title}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: statusStyle.bg,
                color: statusStyle.text,
              }}
            >
              {ticket.status.replace(/_/g, ' ')}
            </span>
            <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              {ticket.priority}
            </span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-placeholder)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {ticket.category && (
            <span>Category: <strong style={{ color: 'var(--text-muted)' }}>{ticket.category.name}</strong></span>
          )}
          <span>Opened: <strong style={{ color: 'var(--text-muted)' }}>{formatDateTime(ticket.createdAt)}</strong></span>
          <span>Updated: <strong style={{ color: 'var(--text-muted)' }}>{formatDateTime(ticket.updatedAt)}</strong></span>
        </div>

        {/* Description */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #f3f4f6',
            fontSize: 14,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        // Rich HTML from TipTap — authored by authenticated users only
        dangerouslySetInnerHTML={{ __html: ticket.description ?? '' }}
        />
      </div>

      {/* ── SLA Status Indicator ──────────────────────────────────────────────── */}
      <SlaIndicator slaStatus={slaStatus} />

      {/* ── Attachments ───────────────────────────────────────────────────────── */}
      {attachments.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiAttachment} size={0.8} color="#6b7280" />
            Attachments ({attachments.length})
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attachments.map((att) => (
              <li
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: 6,
                  border: '1px solid #f3f4f6',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{att.filename}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-placeholder)', marginLeft: 8 }}>{formatFileSize(att.size)}</span>
                </div>
                <a
                  href={`/api/v1/tickets/${id}/attachments/${att.id}/url`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    textDecoration: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: 12,
                  }}
                >
                  <Icon path={mdiDownload} size={0.7} color="currentColor" />
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Comments ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Conversation ({comments.length})
          </h2>
        </div>

        {/* Comment list */}
        {comments.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 13 }}>
            No messages yet. Add a comment below.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {comments.map((comment) => (
              <li key={comment.id}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: 'var(--badge-indigo-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      flexShrink: 0,
                    }}
                  >
                    {comment.author
                      ? `${comment.author.firstName[0] ?? ''}${comment.author.lastName[0] ?? ''}`
                      : '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {comment.author
                          ? `${comment.author.firstName} ${comment.author.lastName}`
                          : 'Support Team'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)' }}>
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        backgroundColor: 'var(--bg-secondary)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #f3f4f6',
                      }}
                      // Comment body is rich HTML from TipTap — authored by authenticated users
                      dangerouslySetInnerHTML={{ __html: comment.body }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add Comment Form */}
        {ticket.status !== 'CLOSED' && ticket.status !== 'CANCELLED' && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6' }}>
            <label
              htmlFor="comment-body"
              style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}
            >
              Add a reply
            </label>
            <RichTextField
              value={commentBody}
              onChange={setCommentBody}
              placeholder="Type your message here..."
              minHeight={80}
              compact
            />
            {commentError && (
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--accent-danger)' }}>{commentError}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => void handleAddComment()}
                disabled={isSubmittingComment || !commentBody.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 18px',
                  backgroundColor: isSubmittingComment || !commentBody.trim() ? '#a5b4fc' : 'var(--accent-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: 8,
                  cursor: isSubmittingComment || !commentBody.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Icon path={mdiSend} size={0.7} color="currentColor" />
                {isSubmittingComment ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
