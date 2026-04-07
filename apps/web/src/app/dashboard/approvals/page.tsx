'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiCheckDecagram, mdiCheck, mdiClose, mdiTicketOutline } from '@mdi/js';

interface PendingApproval {
  id: string;
  stage: number;
  createdAt: string;
  ticket: {
    id: string;
    ticketNumber: number;
    title: string;
    type: string;
    priority: string;
    status: string;
    createdAt: string;
    requestedBy: { id: string; firstName: string; lastName: string } | null;
  };
}

function getPriorityStyle(p: string) {
  switch (p) {
    case 'CRITICAL': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'HIGH': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'MEDIUM': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'LOW': return { bg: 'var(--bg-tertiary)', text: '#374151' };
    default: return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MyApprovalsPage() {
  const qc = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const { data: approvals = [], isLoading } = useQuery<PendingApproval[]>({
    queryKey: ['my-approvals'],
    queryFn: async () => {
      const res = await fetch('/api/v1/tickets/my-approvals', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json() as Promise<PendingApproval[]>;
    },
  });

  const decideMutation = useMutation({
    mutationFn: async ({ approvalId, decision, comment }: { approvalId: string; decision: 'APPROVED' | 'REJECTED'; comment: string }) => {
      const res = await fetch(`/api/v1/tickets/approvals/${approvalId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, comment: comment || undefined }),
      });
      if (!res.ok) throw new Error('Failed to submit decision');
      return res.json();
    },
    onSuccess: () => {
      setDecidingId(null);
      setComment('');
      void qc.invalidateQueries({ queryKey: ['my-approvals'] });
    },
  });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon path={mdiCheckDecagram} size={1} color="#059669" />
        My Approvals
        {approvals.length > 0 && (
          <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, backgroundColor: 'var(--badge-orange-bg)', color: '#9a3412' }}>
            {approvals.length}
          </span>
        )}
      </h1>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : approvals.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiCheckDecagram} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No pending approvals</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {approvals.map((approval) => {
            const priStyle = getPriorityStyle(approval.ticket.priority);
            const isDeciding = decidingId === approval.id;
            return (
              <div key={approval.id} style={{
                backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Link href={`/dashboard/tickets/${approval.ticket.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                        TKT-{approval.ticket.ticketNumber}
                      </Link>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, backgroundColor: priStyle.bg, color: priStyle.text }}>
                        {approval.ticket.priority}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)', textTransform: 'uppercase' }}>
                        {approval.ticket.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <Link href={`/dashboard/tickets/${approval.ticket.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 15 }}>
                      {approval.ticket.title}
                    </Link>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>Requested by: {approval.ticket.requestedBy ? `${approval.ticket.requestedBy.firstName} ${approval.ticket.requestedBy.lastName}` : 'Unknown'}</span>
                      <span>Submitted: {relativeTime(approval.createdAt)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    {!isDeciding ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setDecidingId(approval.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 14px',
                            backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 7,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <Icon path={mdiCheck} size={0.7} color="currentColor" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Reject this approval? The ticket will be cancelled.')) {
                              decideMutation.mutate({ approvalId: approval.id, decision: 'REJECTED', comment: '' });
                            }
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 14px',
                            backgroundColor: 'var(--bg-primary)', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <Icon path={mdiClose} size={0.7} color="currentColor" />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280 }}>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Optional comment..."
                          rows={2}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setDecidingId(null); setComment(''); }}
                            style={{ padding: '5px 12px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => decideMutation.mutate({ approvalId: approval.id, decision: 'APPROVED', comment })}
                            disabled={decideMutation.isPending}
                            style={{ padding: '5px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {decideMutation.isPending ? 'Submitting...' : 'Confirm Approve'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
