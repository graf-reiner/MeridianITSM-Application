'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiAlertOctagonOutline,
  mdiPlus,
  mdiMagnify,
  mdiLinkVariant,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MajorIncident {
  id: string;
  ticketNumber: number;
  title: string;
  status: string;
  priority: string;
  isMajorIncident: boolean;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  majorIncidentCoordinator: { id: string; firstName: string; lastName: string } | null;
  category: { id: string; name: string } | null;
  createdAt: string;
  _count?: { linksFrom?: number; linksTo?: number };
}

interface MajorIncidentsResponse {
  data: MajorIncident[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Status / Priority styling ────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: '#eff6ff', text: '#1d4ed8' },
  OPEN: { bg: '#f0fdf4', text: '#15803d' },
  IN_PROGRESS: { bg: '#fffbeb', text: '#b45309' },
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  RESOLVED: { bg: '#f0fdf4', text: '#166534' },
  CLOSED: { bg: '#f1f5f9', text: '#475569' },
  CANCELLED: { bg: '#fef2f2', text: '#991b1b' },
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#6b7280',
};

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MajorIncidentsPage() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading, error } = useQuery<MajorIncidentsResponse>({
    queryKey: ['major-incidents', status, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        isMajorIncident: 'true',
        page: String(page),
        pageSize: String(pageSize),
        sortBy: 'createdAt',
        sortDir: 'desc',
      });
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const res = await fetch(`/api/v1/tickets?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load major incidents: ${res.status}`);
      return res.json() as Promise<MajorIncidentsResponse>;
    },
  });

  const incidents = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiAlertOctagonOutline} size={1} color="#dc2626" />
          Major Incidents
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link
            href="/dashboard/major-incidents/detected"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)', textDecoration: 'none',
              border: '1px solid var(--border-secondary)',
              borderRadius: 8, fontSize: 14, fontWeight: 600,
            }}
          >
            Detected signals
          </Link>
          <Link
            href="/dashboard/tickets/new?majorIncident=true"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', backgroundColor: '#dc2626', color: '#fff',
              textDecoration: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Declare Major Incident
          </Link>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="var(--text-placeholder)" />
          </div>
          <input
            type="search"
            placeholder="Search major incidents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '8px 10px 8px 34px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
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
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* ── Active count ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
        {total} major incident{total !== 1 ? 's' : ''} found
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading major incidents...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>{error instanceof Error ? error.message : 'Failed to load'}</div>
      ) : incidents.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiAlertOctagonOutline} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No major incidents found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Number</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Priority</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Coordinator</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Assignee</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => {
                const statusStyle = STATUS_COLORS[inc.status] ?? { bg: '#f1f5f9', text: '#475569' };
                const priorityColor = PRIORITY_COLORS[inc.priority] ?? '#6b7280';
                return (
                  <tr key={inc.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link href={`/dashboard/tickets/${inc.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
                        #{inc.ticketNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/dashboard/tickets/${inc.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
                        {inc.title}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {inc.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: priorityColor, display: 'inline-block' }} />
                        <span style={{ fontSize: 13, color: priorityColor, fontWeight: 500 }}>{inc.priority}</span>
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 13 }}>
                      {inc.majorIncidentCoordinator
                        ? `${inc.majorIncidentCoordinator.firstName} ${inc.majorIncidentCoordinator.lastName}`
                        : '\u2014'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 13 }}>
                      {inc.assignedTo
                        ? `${inc.assignedTo.firstName} ${inc.assignedTo.lastName}`
                        : '\u2014'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-placeholder)', fontSize: 12 }}>
                      {relativeTime(inc.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} ({total} incidents)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
