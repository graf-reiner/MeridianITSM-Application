'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiAlertDecagramOutline,
  mdiPlus,
  mdiMagnify,
  mdiLinkVariant,
  mdiServerNetwork,
} from '@mdi/js';

interface Problem {
  id: string;
  ticketNumber: number;
  title: string;
  status: string;
  priority: string;
  rootCause: string | null;
  workaround: string | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  category: { id: string; name: string } | null;
  createdAt: string;
  _count: { problemIncidents: number; cmdbProblemLinks: number };
}

interface ProblemsResponse {
  data: Problem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: '#eff6ff', text: '#1d4ed8' },
  OPEN: { bg: '#f0fdf4', text: '#15803d' },
  IN_PROGRESS: { bg: '#fffbeb', text: '#b45309' },
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  RESOLVED: { bg: '#f0fdf4', text: '#166534' },
  CLOSED: { bg: '#f1f5f9', text: '#475569' },
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#6b7280',
};

export default function ProblemsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<ProblemsResponse>({
    queryKey: ['problems', search, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/v1/problems?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load problems');
      return res.json() as Promise<ProblemsResponse>;
    },
    staleTime: 30_000,
  });

  const problems = data?.data ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiAlertDecagramOutline} size={1} color="var(--accent-primary)" />
          Problems
          {data && <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({data.total})</span>}
        </h1>
        <Link
          href="/dashboard/tickets/new?type=PROBLEM"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
            borderRadius: 8, border: 'none', backgroundColor: 'var(--accent-primary)',
            color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}
        >
          <Icon path={mdiPlus} size={0.75} color="#fff" />
          New Problem
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Icon path={mdiMagnify} size={0.75} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: 10 }} />
          <input
            placeholder="Search problems..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8,
              border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{
            padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
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

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading problems...</div>
      ) : problems.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', border: '1px dashed var(--border-primary)', borderRadius: 12, backgroundColor: 'var(--bg-secondary)' }}>
          <Icon path={mdiAlertDecagramOutline} size={2} color="var(--text-muted)" style={{ opacity: 0.3 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 14 }}>
            {search || statusFilter ? 'No problems match your filters.' : 'No problems recorded yet.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Title</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Priority</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Incidents</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>CIs</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Assigned</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => {
                  const sc = STATUS_COLORS[p.status] ?? STATUS_COLORS.NEW;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                        PRB-{String(p.ticketNumber).padStart(5, '0')}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <Link href={`/dashboard/problems/${p.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                          {p.title}
                        </Link>
                        {p.rootCause && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Root cause identified
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                          backgroundColor: sc.bg, color: sc.text, fontSize: 11, fontWeight: 600,
                        }}>
                          {p.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: PRIORITY_COLORS[p.priority] ?? 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>
                        {p.priority}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)', fontSize: 12 }}>
                          <Icon path={mdiLinkVariant} size={0.5} color="var(--text-muted)" />
                          {p._count.problemIncidents}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)', fontSize: 12 }}>
                          <Icon path={mdiServerNetwork} size={0.5} color="var(--text-muted)" />
                          {p._count.cmdbProblemLinks}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
                        {p.assignedTo ? `${p.assignedTo.firstName} ${p.assignedTo.lastName}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pageCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
                Page {page} of {data.pageCount}
              </span>
              <button
                disabled={page >= data.pageCount}
                onClick={() => setPage(page + 1)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', fontSize: 13, cursor: page >= data.pageCount ? 'not-allowed' : 'pointer', opacity: page >= data.pageCount ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
