'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiEmailSync, mdiChevronLeft, mdiChevronRight } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailActivityEntry {
  id: string;
  direction: string;
  status: string;
  subject: string | null;
  fromAddress: string | null;
  toAddresses: string | string[] | null;
  messageId: string | null;
  ticketId: string | null;
  attemptNumber: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  occurredAt: string;
  emailAccountId: string | null;
}

interface ActivityResponse {
  data: EmailActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'SENDING', label: 'Sending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'RETRYING', label: 'Retrying' },
  { value: 'PERMANENT_FAILURE', label: 'Permanent Failure' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'POLL_STARTED', label: 'Poll Started' },
  { value: 'POLL_COMPLETE', label: 'Poll Complete' },
  { value: 'POLL_FAILED', label: 'Poll Failed' },
];

const DIRECTION_OPTIONS = [
  { value: '', label: 'All Directions' },
  { value: 'OUTBOUND', label: 'Outbound' },
  { value: 'INBOUND', label: 'Inbound' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusBadgeStyle(status: string): { backgroundColor: string; color: string } {
  switch (status) {
    case 'SENT':
    case 'RECEIVED':
    case 'POLL_COMPLETE':
      return { backgroundColor: 'var(--badge-green-bg)', color: '#065f46' };
    case 'FAILED':
    case 'POLL_FAILED':
      return { backgroundColor: 'var(--badge-red-bg)', color: '#991b1b' };
    case 'PERMANENT_FAILURE':
      return { backgroundColor: 'var(--badge-red-bg-strong)', color: '#7f1d1d' };
    case 'RETRYING':
    case 'SENDING':
    case 'POLL_STARTED':
      return { backgroundColor: 'var(--badge-yellow-bg)', color: '#92400e' };
    case 'QUEUED':
      return { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
    default:
      return { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
  }
}

function getDirectionBadgeStyle(direction: string): { backgroundColor: string; color: string } {
  if (direction === 'INBOUND') return { backgroundColor: 'var(--badge-green-bg)', color: '#065f46' };
  return { backgroundColor: 'var(--badge-blue-bg)', color: '#1e40af' };
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(str: string | null | undefined, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function formatToAddresses(val: string | string[] | null): string {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return val;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmailActivityPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data, isLoading } = useQuery<ActivityResponse>({
    queryKey: ['email-activity', page, pageSize, direction, status, fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (direction) params.set('direction', direction);
      if (status) params.set('status', status);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/v1/settings/email-activity?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load email activity');
      return res.json();
    },
  });

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectStyle = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' };
  const inputStyle = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' };
  const thStyle = { padding: '10px 12px', textAlign: 'left' as const, fontWeight: 600 as const, color: 'var(--text-secondary)', fontSize: 13 };
  const tdStyle = { padding: '10px 12px', fontSize: 13, color: 'var(--text-secondary)' };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings/email" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiEmailSync} size={1} color="#4f46e5" />
          Email Activity
        </h1>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }} style={selectStyle}>
          {DIRECTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={selectStyle}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>From</label>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>To</label>
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} style={inputStyle} />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading email activity...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Direction</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>From</th>
                  <th style={thStyle}>To</th>
                  <th style={thStyle}>Message ID</th>
                  <th style={thStyle}>Ticket</th>
                  <th style={thStyle}>Error</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, ...getDirectionBadgeStyle(entry.direction) }}>
                        {entry.direction}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, ...getStatusBadgeStyle(entry.status) }}>
                        {formatStatus(entry.status)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.subject ?? ''}>
                      {entry.subject ?? ''}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12 }}>
                      {entry.fromAddress ?? ''}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatToAddresses(entry.toAddresses)}>
                      {formatToAddresses(entry.toAddresses)}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-placeholder)', fontSize: 11, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.messageId ?? ''}>
                      {truncate(entry.messageId, 20)}
                    </td>
                    <td style={tdStyle}>
                      {entry.ticketId ? (
                        <Link href={`/dashboard/tickets/${entry.ticketId}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
                          View Ticket
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--border-secondary)' }}>-</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--accent-danger)', fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.errorMessage ?? ''}>
                      {entry.errorMessage ? truncate(entry.errorMessage, 40) : ''}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                      No email activity found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderTop: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', backgroundColor: 'var(--bg-primary)', color: page <= 1 ? 'var(--border-secondary)' : 'var(--text-secondary)' }}
                >
                  <Icon path={mdiChevronLeft} size={0.7} color="currentColor" />
                  Prev
                </button>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 8px' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer', backgroundColor: 'var(--bg-primary)', color: page >= totalPages ? 'var(--border-secondary)' : 'var(--text-secondary)' }}
                >
                  Next
                  <Icon path={mdiChevronRight} size={0.7} color="currentColor" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
