'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiTicket, mdiPlus, mdiMagnify, mdiFilter } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  assignee: { firstName: string; lastName: string } | null;
  category: { name: string } | null;
  createdAt: string;
  slaElapsedPercentage?: number;
}

interface TicketListResponse {
  tickets: Ticket[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
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

function getPriorityStyle(priority: string): { bg: string; text: string } {
  switch (priority) {
    case 'CRITICAL': return { bg: '#fee2e2', text: '#991b1b' };
    case 'HIGH': return { bg: '#ffedd5', text: '#9a3412' };
    case 'MEDIUM': return { bg: '#fef3c7', text: '#92400e' };
    case 'LOW': return { bg: '#f3f4f6', text: '#374151' };
    default: return { bg: '#f3f4f6', text: '#374151' };
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

/** Mini SLA dot — green/yellow/red/breached based on elapsed percentage */
function SlaDot({ pct }: { pct?: number }) {
  if (pct === undefined) return null;
  let color = '#16a34a';
  if (pct >= 100) color = '#b91c1c';
  else if (pct >= 90) color = '#dc2626';
  else if (pct >= 75) color = '#ca8a04';
  return (
    <span
      title={`SLA ${Math.round(pct)}%`}
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: color }}
    />
  );
}

// ─── Ticket List Page ─────────────────────────────────────────────────────────

export default function DashboardTicketsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = useQuery<TicketListResponse>({
    queryKey: ['tickets', search, status, priority, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      const res = await fetch(`/api/v1/tickets?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
      return res.json() as Promise<TicketListResponse>;
    },
  });

  // API returns { data: [...], total?, page?, pageSize? }
  const tickets = (data as any)?.data ?? (data as any)?.tickets ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTicket} size={1} color="#4f46e5" />
          Tickets
        </h1>
        <Link
          href="/dashboard/tickets/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: '#4f46e5',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Icon path={mdiPlus} size={0.8} color="currentColor" />
          New Ticket
        </Link>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="#9ca3af" />
          </div>
          <input
            type="search"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '8px 10px 8px 34px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFilter} size={0.75} color="#9ca3af" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING">Pending</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Priority filter */}
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading tickets...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          {error instanceof Error ? error.message : 'Failed to load tickets'}
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiTicket} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: '#6b7280', fontSize: 14 }}>No tickets found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Number</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Priority</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Assignee</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Created</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket: any) => {
                const statusStyle = getStatusStyle(ticket.status);
                const priorityStyle = getPriorityStyle(ticket.priority);
                return (
                  <tr key={ticket.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/tickets/${ticket.id}`}
                        style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={`/dashboard/tickets/${ticket.id}`}
                        style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {ticket.title}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: priorityStyle.bg, color: priorityStyle.text }}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13 }}>
                      {ticket.category?.name ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {relativeTime(ticket.createdAt)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <SlaDot pct={ticket.slaElapsedPercentage} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14, color: '#6b7280' }}>
            Page {page} of {totalPages} ({total} tickets)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
