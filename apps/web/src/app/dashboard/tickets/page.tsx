'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiTicket, mdiPlus, mdiMagnify, mdiFilter, mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiClose, mdiBookmarkOutline, mdiBookmark } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  assignee: { firstName: string; lastName: string } | null;
  category: { name: string } | null;
  source: string;
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
    case 'NEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'OPEN': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'PENDING': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'RESOLVED': return { bg: 'var(--bg-tertiary)', text: '#374151' };
    case 'CLOSED': return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    case 'CANCELLED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default: return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function getPriorityStyle(priority: string): { bg: string; text: string } {
  switch (priority) {
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

interface SavedView {
  id: string;
  name: string;
  filters: { status?: string; priority?: string; search?: string };
  isShared: boolean;
}

export default function DashboardTicketsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const PAGE_SIZE = 25;
  const qc = useQueryClient();

  // Saved views
  const { data: savedViews = [] } = useQuery<SavedView[]>({
    queryKey: ['ticket-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/tickets/views', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json() as Promise<SavedView[]>;
    },
  });

  // Bulk action mutation
  const bulkMutation = useMutation({
    mutationFn: async (payload: { ticketIds: string[]; action: string; status?: string; priority?: string }) => {
      const res = await fetch('/api/v1/tickets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Bulk action failed');
      return res.json();
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      setBulkAction('');
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((ticketIds: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ticketIds.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ticketIds);
    });
  }, []);

  const applyView = useCallback((view: SavedView) => {
    setActiveViewId(view.id);
    setSearch(view.filters.search ?? '');
    setStatus(view.filters.status ?? '');
    setPriority(view.filters.priority ?? '');
    setPage(1);
  }, []);

  const executeBulkAction = useCallback(() => {
    if (selectedIds.size === 0 || !bulkAction) return;
    const ids = [...selectedIds];
    switch (bulkAction) {
      case 'close':
        bulkMutation.mutate({ ticketIds: ids, action: 'close' });
        break;
      case 'status_open':
        bulkMutation.mutate({ ticketIds: ids, action: 'change_status', status: 'OPEN' });
        break;
      case 'status_in_progress':
        bulkMutation.mutate({ ticketIds: ids, action: 'change_status', status: 'IN_PROGRESS' });
        break;
      case 'priority_high':
        bulkMutation.mutate({ ticketIds: ids, action: 'change_priority', priority: 'HIGH' });
        break;
      case 'priority_critical':
        bulkMutation.mutate({ ticketIds: ids, action: 'change_priority', priority: 'CRITICAL' });
        break;
    }
  }, [selectedIds, bulkAction, bulkMutation]);

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
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTicket} size={1} color="var(--accent-primary)" />
          Tickets
        </h1>
        <Link
          href="/dashboard/tickets/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            backgroundColor: 'var(--accent-primary)',
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
            <Icon path={mdiMagnify} size={0.8} color="var(--text-placeholder)" />
          </div>
          <input
            type="search"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '8px 10px 8px 34px',
              border: '1px solid var(--border-secondary)',
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFilter} size={0.75} color="var(--text-placeholder)" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING">Pending</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Priority filter */}
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* ── Saved Views ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => { setActiveViewId(null); setSearch(''); setStatus(''); setPriority(''); setPage(1); }}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border-secondary)',
            backgroundColor: activeViewId === null ? 'var(--accent-primary)' : 'var(--bg-primary)',
            color: activeViewId === null ? '#fff' : 'var(--text-secondary)',
          }}
        >
          All Tickets
        </button>
        {savedViews.map(view => (
          <div key={view.id} style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
            <button
              onClick={() => applyView(view)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '5px 12px', borderRadius: '6px 0 0 6px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid var(--border-secondary)',
                backgroundColor: activeViewId === view.id ? 'var(--accent-primary)' : 'var(--bg-primary)',
                color: activeViewId === view.id ? '#fff' : 'var(--text-secondary)',
                borderRight: 'none',
              }}
            >
              <Icon path={view.isShared ? mdiBookmark : mdiBookmarkOutline} size={0.5} color="currentColor" />
              {view.name}
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(`Delete view "${view.name}"?`)) return;
                await fetch(`/api/v1/tickets/views/${view.id}`, { method: 'DELETE', credentials: 'include' });
                void qc.invalidateQueries({ queryKey: ['ticket-views'] });
                if (activeViewId === view.id) setActiveViewId(null);
              }}
              style={{
                padding: '5px 6px', borderRadius: '0 6px 6px 0', fontSize: 10, cursor: 'pointer',
                border: '1px solid var(--border-secondary)',
                backgroundColor: activeViewId === view.id ? 'var(--accent-primary)' : 'var(--bg-primary)',
                color: activeViewId === view.id ? '#fff' : 'var(--text-placeholder)',
              }}
              title="Delete view"
            >
              <Icon path={mdiClose} size={0.45} color="currentColor" />
            </button>
          </div>
        ))}
        {/* Save current filters as a view */}
        {(search || status || priority) && (
          <button
            onClick={async () => {
              const name = window.prompt('View name:');
              if (!name?.trim()) return;
              await fetch('/api/v1/tickets/views', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ name: name.trim(), filters: { search, status, priority } }),
              });
              void qc.invalidateQueries({ queryKey: ['ticket-views'] });
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px dashed var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)',
            }}
          >
            <Icon path={mdiBookmarkOutline} size={0.5} color="currentColor" />
            Save View
          </button>
        )}
      </div>

      {/* ── Bulk Action Bar ──────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 12,
          backgroundColor: 'var(--badge-blue-bg)', borderRadius: 8, border: '1px solid var(--accent-primary)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-primary)' }}>
            {selectedIds.size} selected
          </span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            style={{ padding: '5px 8px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
          >
            <option value="">Choose action...</option>
            <option value="status_open">Set Open</option>
            <option value="status_in_progress">Set In Progress</option>
            <option value="priority_high">Set High Priority</option>
            <option value="priority_critical">Set Critical Priority</option>
            <option value="close">Close</option>
          </select>
          <button
            onClick={executeBulkAction}
            disabled={!bulkAction || bulkMutation.isPending}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: bulkAction ? 'pointer' : 'not-allowed',
              backgroundColor: bulkAction ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: '#fff', border: 'none',
            }}
          >
            {bulkMutation.isPending ? 'Applying...' : 'Apply'}
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkAction(''); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <Icon path={mdiClose} size={0.7} color="currentColor" />
          </button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading tickets...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
          {error instanceof Error ? error.message : 'Failed to load tickets'}
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiTicket} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No tickets found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 8px 10px 14px', width: 32 }}>
                  <button
                    onClick={() => toggleSelectAll(tickets.map((t: any) => t.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <Icon
                      path={tickets.length > 0 && tickets.every((t: any) => selectedIds.has(t.id)) ? mdiCheckboxMarked : mdiCheckboxBlankOutline}
                      size={0.8}
                      color="var(--text-secondary)"
                    />
                  </button>
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Number</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Priority</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Assignee</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Source</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Created</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket: any) => {
                const statusStyle = getStatusStyle(ticket.status);
                const priorityStyle = getPriorityStyle(ticket.priority);
                return (
                  <tr key={ticket.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: selectedIds.has(ticket.id) ? 'var(--badge-blue-bg)' : undefined }}>
                    <td style={{ padding: '10px 8px 10px 14px', width: 32 }}>
                      <button
                        onClick={() => toggleSelect(ticket.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      >
                        <Icon
                          path={selectedIds.has(ticket.id) ? mdiCheckboxMarked : mdiCheckboxBlankOutline}
                          size={0.8}
                          color={selectedIds.has(ticket.id) ? 'var(--accent-primary)' : 'var(--text-placeholder)'}
                        />
                      </button>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/tickets/${ticket.id}`}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={`/dashboard/tickets/${ticket.id}`}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
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
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                      {ticket.category?.name ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                        {ticket.source?.replace(/_/g, ' ') ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-placeholder)', fontSize: 12, whiteSpace: 'nowrap' }}>
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
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} ({total} tickets)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
