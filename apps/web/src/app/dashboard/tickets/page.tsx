'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiTicket, mdiPlus, mdiMagnify, mdiFilter, mdiCheckboxBlankOutline, mdiCheckboxMarked,
  mdiClose, mdiChevronDown, mdiStar, mdiStarOutline, mdiPencilOutline, mdiTrashCanOutline,
  mdiDownload, mdiUpload, mdiEarth, mdiAccountMultiple, mdiAccount,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  assignee: { firstName: string; lastName: string } | null;
  assignedGroup: { name: string } | null;
  requestedBy: { firstName: string; lastName: string } | null;
  category: { name: string } | null;
  queue: { name: string } | null;
  source: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  slaElapsedPercentage?: number;
}

interface TicketListResponse { tickets: Ticket[]; total: number }

interface DisplayConfig {
  textColor?: string;
  bgColor?: string;
  badgeColors?: Record<string, { bg: string; text: string }>;
  columns?: string[];
}

interface SavedView {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, string>;
  sortBy: string | null;
  sortDir: string | null;
  displayConfig: DisplayConfig | null;
  isGlobal: boolean;
  isDefault: boolean;
  userId: string;
  user?: { id: string; firstName: string; lastName: string };
  assignments?: Array<{ userId?: string; userGroupId?: string }>;
}

interface ViewFilters {
  [key: string]: string | undefined;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'NEW': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'OPEN': return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'IN_PROGRESS': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'PENDING': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
    case 'PENDING_APPROVAL': return { bg: 'var(--badge-orange-bg)', text: '#9a3412' };
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

function SlaDot({ pct }: { pct?: number }) {
  if (pct === undefined) return null;
  let color = '#16a34a';
  if (pct >= 100) color = '#b91c1c';
  else if (pct >= 90) color = '#dc2626';
  else if (pct >= 75) color = '#ca8a04';
  return <span title={`SLA ${Math.round(pct)}%`} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />;
}

// ─── Column Definitions ─────────────────────────────────────────────────────

const COLUMN_DEFS: Record<string, { label: string; render: (t: Ticket) => React.ReactNode; style?: React.CSSProperties }> = {
  ticketNumber: {
    label: 'Number',
    render: (t) => <Link href={`/dashboard/tickets/${t.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>{t.ticketNumber}</Link>,
    style: { whiteSpace: 'nowrap' },
  },
  title: {
    label: 'Title',
    render: (t) => <Link href={`/dashboard/tickets/${t.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>{t.title}</Link>,
  },
  status: {
    label: 'Status',
    render: (t) => { const s = getStatusStyle(t.status); return <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: s.bg, color: s.text }}>{t.status.replace(/_/g, ' ')}</span>; },
    style: { whiteSpace: 'nowrap' },
  },
  priority: {
    label: 'Priority',
    render: (t) => { const s = getPriorityStyle(t.priority); return <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: s.bg, color: s.text }}>{t.priority}</span>; },
    style: { whiteSpace: 'nowrap' },
  },
  type: { label: 'Type', render: (t) => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.type?.replace(/_/g, ' ')}</span>, style: { whiteSpace: 'nowrap' } },
  assignedTo: { label: 'Assignee', render: (t) => <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '—'}</span>, style: { whiteSpace: 'nowrap' } },
  assignedGroup: { label: 'Group', render: (t) => <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.assignedGroup?.name ?? '—'}</span> },
  requestedBy: { label: 'Requester', render: (t) => <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.requestedBy ? `${t.requestedBy.firstName} ${t.requestedBy.lastName}` : '—'}</span> },
  queue: { label: 'Queue', render: (t) => <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.queue?.name ?? '—'}</span> },
  category: { label: 'Category', render: (t) => <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.category?.name ?? '—'}</span> },
  source: { label: 'Source', render: (t) => <span style={{ padding: '2px 6px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>{t.source?.replace(/_/g, ' ') ?? '—'}</span>, style: { whiteSpace: 'nowrap' } },
  tags: { label: 'Tags', render: (t) => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.tags?.join(', ') || '—'}</span> },
  createdAt: { label: 'Created', render: (t) => <span style={{ color: 'var(--text-placeholder)', fontSize: 12 }}>{relativeTime(t.createdAt)}</span>, style: { whiteSpace: 'nowrap' } },
  updatedAt: { label: 'Updated', render: (t) => <span style={{ color: 'var(--text-placeholder)', fontSize: 12 }}>{relativeTime(t.updatedAt)}</span>, style: { whiteSpace: 'nowrap' } },
  sla: { label: 'SLA', render: (t) => <SlaDot pct={t.slaElapsedPercentage} />, style: { textAlign: 'center' } },
};

const DEFAULT_COLUMNS = ['ticketNumber', 'title', 'status', 'priority', 'assignedTo', 'category', 'source', 'createdAt', 'sla'];

// ─── Ticket List Page ─────────────────────────────────────────────────────────

export default function DashboardTicketsPage() {
  const [filters, setFilters] = useState<ViewFilters>({});
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig | null>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [defaultApplied, setDefaultApplied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 25;
  const qc = useQueryClient();

  const visibleColumns = displayConfig?.columns ?? DEFAULT_COLUMNS;

  // Saved views
  const { data: savedViews = [] } = useQuery<SavedView[]>({
    queryKey: ['ticket-views'],
    queryFn: async () => {
      const res = await fetch('/api/v1/tickets/views', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json() as Promise<SavedView[]>;
    },
  });

  // Default view — auto-apply on first load
  const { data: defaultView } = useQuery<SavedView | null>({
    queryKey: ['ticket-views', 'default'],
    queryFn: async () => {
      const res = await fetch('/api/v1/tickets/views/default', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (defaultView && !defaultApplied && !activeViewId) {
      applyView(defaultView);
      setDefaultApplied(true);
    }
  }, [defaultView, defaultApplied, activeViewId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Bulk action mutation
  const bulkMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/v1/tickets/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Bulk action failed');
      return res.json();
    },
    onSuccess: () => { setSelectedIds(new Set()); setBulkAction(''); void qc.invalidateQueries({ queryKey: ['tickets'] }); },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids));
  }, []);

  const applyView = useCallback((view: SavedView) => {
    setActiveViewId(view.id);
    setFilters(view.filters ?? {});
    setSortBy(view.sortBy ?? 'createdAt');
    setSortDir(view.sortDir ?? 'desc');
    setDisplayConfig(view.displayConfig ?? null);
    setPage(1);
    setDropdownOpen(false);
  }, []);

  const clearView = useCallback(() => {
    setActiveViewId(null);
    setFilters({});
    setSortBy('createdAt');
    setSortDir('desc');
    setDisplayConfig(null);
    setPage(1);
  }, []);

  const executeBulkAction = useCallback(() => {
    if (selectedIds.size === 0 || !bulkAction) return;
    const ids = [...selectedIds];
    const actions: Record<string, Record<string, unknown>> = {
      close: { ticketIds: ids, action: 'close' },
      status_open: { ticketIds: ids, action: 'change_status', status: 'OPEN' },
      status_in_progress: { ticketIds: ids, action: 'change_status', status: 'IN_PROGRESS' },
      priority_high: { ticketIds: ids, action: 'change_priority', priority: 'HIGH' },
      priority_critical: { ticketIds: ids, action: 'change_priority', priority: 'CRITICAL' },
    };
    if (actions[bulkAction]) bulkMutation.mutate(actions[bulkAction]);
  }, [selectedIds, bulkAction, bulkMutation]);

  // Build query params from filters
  const { data, isLoading, error } = useQuery<TicketListResponse>({
    queryKey: ['tickets', filters, sortBy, sortDir, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sortBy, sortDir });
      for (const [key, val] of Object.entries(filters)) {
        if (val) params.set(key, val);
      }
      const res = await fetch(`/api/v1/tickets?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load tickets: ${res.status}`);
      return res.json() as Promise<TicketListResponse>;
    },
  });

  const tickets = (data as any)?.data ?? (data as any)?.tickets ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Separate views into mine vs shared
  const myViews = savedViews.filter(v => v.userId === (savedViews[0]?.userId)); // Simplified — real check would use session
  const sharedViews = savedViews.filter(v => v.isGlobal || v.assignments?.length);
  const activeView = savedViews.find(v => v.id === activeViewId);
  const activeViewName = activeView?.name ?? 'All Tickets';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTicket} size={1} color="var(--accent-primary)" />
          Tickets
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/tickets/views/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
            <Icon path={mdiFilter} size={0.7} color="currentColor" />
            Create View
          </Link>
          <Link href="/dashboard/tickets/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Ticket
          </Link>
        </div>
      </div>

      {/* ── View Selector Dropdown + Search ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* View dropdown */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14,
              fontWeight: 500, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
              minWidth: 180,
            }}
          >
            {activeView?.displayConfig?.bgColor && (
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: activeView.displayConfig.bgColor, border: '1px solid var(--border-secondary)', flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, textAlign: 'left' }}>{activeViewName}</span>
            <Icon path={mdiChevronDown} size={0.7} color="var(--text-muted)" />
          </button>

          {dropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 320,
              backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden',
            }}>
              {/* All Tickets option */}
              <button
                onClick={clearView}
                style={{ width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: activeViewId === null ? 600 : 400, backgroundColor: activeViewId === null ? 'var(--badge-blue-bg)' : 'transparent', color: 'var(--text-primary)' }}
                onMouseEnter={e => { if (activeViewId !== null) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}
                onMouseLeave={e => { if (activeViewId !== null) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                All Tickets
              </button>

              {savedViews.length > 0 && (
                <>
                  <div style={{ borderTop: '1px solid var(--bg-tertiary)', margin: '0' }} />
                  <div style={{ padding: '6px 14px 3px', fontSize: 11, fontWeight: 600, color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Views</div>
                  {savedViews.map(view => (
                    <div
                      key={view.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', cursor: 'pointer', backgroundColor: activeViewId === view.id ? 'var(--badge-blue-bg)' : 'transparent' }}
                      onMouseEnter={e => { if (activeViewId !== view.id) e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'; }}
                      onMouseLeave={e => { if (activeViewId !== view.id) e.currentTarget.style.backgroundColor = activeViewId === view.id ? 'var(--badge-blue-bg)' : 'transparent'; }}
                    >
                      {/* Color dot */}
                      {view.displayConfig?.bgColor ? (
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: view.displayConfig.bgColor, flexShrink: 0 }} />
                      ) : (
                        <Icon path={view.isGlobal ? mdiEarth : view.assignments?.length ? mdiAccountMultiple : mdiAccount} size={0.55} color="var(--text-placeholder)" />
                      )}

                      {/* Name — click to apply */}
                      <button onClick={() => applyView(view)} style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: activeViewId === view.id ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-primary)' }}>
                        {view.name}
                      </button>

                      {/* Default star */}
                      {view.isDefault && <Icon path={mdiStar} size={0.55} color="#f59e0b" />}

                      {/* Edit */}
                      <Link href={`/dashboard/tickets/views/${view.id}/edit`} onClick={() => setDropdownOpen(false)} style={{ display: 'flex', padding: 2, color: 'var(--text-placeholder)' }}>
                        <Icon path={mdiPencilOutline} size={0.55} color="currentColor" />
                      </Link>

                      {/* Delete */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Delete view "${view.name}"?`)) return;
                          await fetch(`/api/v1/tickets/views/${view.id}`, { method: 'DELETE', credentials: 'include' });
                          void qc.invalidateQueries({ queryKey: ['ticket-views'] });
                          if (activeViewId === view.id) clearView();
                        }}
                        style={{ display: 'flex', padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-placeholder)' }}
                      >
                        <Icon path={mdiTrashCanOutline} size={0.55} color="currentColor" />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Footer links */}
              <div style={{ borderTop: '1px solid var(--bg-tertiary)', padding: '8px 14px', display: 'flex', gap: 12 }}>
                <Link href="/dashboard/tickets/views/new" onClick={() => setDropdownOpen(false)} style={{ fontSize: 13, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                  + Create View
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick search */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="var(--text-placeholder)" />
          </div>
          <input
            type="search"
            placeholder="Search tickets..."
            value={filters.search ?? ''}
            onChange={(e) => { setFilters(prev => ({ ...prev, search: e.target.value || undefined })); setPage(1); }}
            style={{ width: '100%', padding: '8px 10px 8px 34px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Quick status filter */}
        <select
          value={filters.status ?? ''}
          onChange={(e) => { setFilters(prev => ({ ...prev, status: e.target.value || undefined })); setPage(1); }}
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

        {/* Quick priority filter */}
        <select
          value={filters.priority ?? ''}
          onChange={(e) => { setFilters(prev => ({ ...prev, priority: e.target.value || undefined })); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* ── Bulk Action Bar ──────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 12, backgroundColor: 'var(--badge-blue-bg)', borderRadius: 8, border: '1px solid var(--accent-primary)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-primary)' }}>{selectedIds.size} selected</span>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} style={{ padding: '5px 8px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
            <option value="">Choose action...</option>
            <option value="status_open">Set Open</option>
            <option value="status_in_progress">Set In Progress</option>
            <option value="priority_high">Set High Priority</option>
            <option value="priority_critical">Set Critical Priority</option>
            <option value="close">Close</option>
          </select>
          <button onClick={executeBulkAction} disabled={!bulkAction || bulkMutation.isPending} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: bulkAction ? 'pointer' : 'not-allowed', backgroundColor: bulkAction ? 'var(--accent-primary)' : 'var(--bg-tertiary)', color: '#fff', border: 'none' }}>
            {bulkMutation.isPending ? 'Applying...' : 'Apply'}
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setBulkAction(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <Icon path={mdiClose} size={0.7} color="currentColor" />
          </button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading tickets...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>{error instanceof Error ? error.message : 'Failed to load tickets'}</div>
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
                  <button onClick={() => toggleSelectAll(tickets.map((t: any) => t.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <Icon path={tickets.length > 0 && tickets.every((t: any) => selectedIds.has(t.id)) ? mdiCheckboxMarked : mdiCheckboxBlankOutline} size={0.8} color="var(--text-secondary)" />
                  </button>
                </th>
                {visibleColumns.map(colKey => {
                  const def = COLUMN_DEFS[colKey];
                  if (!def) return null;
                  return (
                    <th key={colKey} style={{ padding: '10px 14px', textAlign: (def.style?.textAlign as any) ?? 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {def.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket: any) => (
                <tr
                  key={ticket.id}
                  style={{
                    borderBottom: '1px solid var(--bg-tertiary)',
                    backgroundColor: selectedIds.has(ticket.id) ? 'var(--badge-blue-bg)' : displayConfig?.bgColor || undefined,
                    color: displayConfig?.textColor || undefined,
                  }}
                >
                  <td style={{ padding: '10px 8px 10px 14px', width: 32 }}>
                    <button onClick={() => toggleSelect(ticket.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      <Icon path={selectedIds.has(ticket.id) ? mdiCheckboxMarked : mdiCheckboxBlankOutline} size={0.8} color={selectedIds.has(ticket.id) ? 'var(--accent-primary)' : 'var(--text-placeholder)'} />
                    </button>
                  </td>
                  {visibleColumns.map(colKey => {
                    const def = COLUMN_DEFS[colKey];
                    if (!def) return null;
                    return (
                      <td key={colKey} style={{ padding: '10px 14px', ...def.style }}>
                        {def.render(ticket)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}>Previous</button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Page {page} of {totalPages} ({total} tickets)</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}>Next</button>
        </div>
      )}
    </div>
  );
}
