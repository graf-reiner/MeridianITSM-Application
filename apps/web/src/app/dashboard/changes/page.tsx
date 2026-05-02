'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiSwapHorizontal, mdiPlus, mdiCalendar, mdiMagnify, mdiFilter, mdiArrowUp, mdiArrowDown, mdiUnfoldMoreHorizontal } from '@mdi/js';
import { formatChangeNumber } from '@meridian/core/record-numbers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Change {
  id: string;
  changeNumber: string;
  title: string;
  type: string;
  status: string;
  riskLevel: string;
  requestedBy: { firstName: string | null; lastName: string | null; email: string } | null;
  agentUpdateDeployment: { id: string } | null;
  scheduledStart: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChangeListResponse {
  data: Change[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'NEW':                return { bg: 'var(--bg-tertiary)', text: '#374151' };
    case 'ASSESSMENT':         return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'APPROVAL_PENDING':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'APPROVED':           return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'REJECTED':           return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'SCHEDULED':          return { bg: 'var(--badge-indigo-bg)', text: '#3730a3' };
    case 'IMPLEMENTING':       return { bg: '#fef9c3', text: '#854d0e' };
    case 'REVIEW':             return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'COMPLETED':          return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'CANCELLED':          return { bg: 'var(--bg-tertiary)', text: '#9ca3af' };
    default:                   return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function requestedByLabel(change: Change): string {
  if (change.agentUpdateDeployment) return 'System';
  if (!change.requestedBy) return '—';
  const name = `${change.requestedBy.firstName ?? ''} ${change.requestedBy.lastName ?? ''}`.trim();
  return name || change.requestedBy.email;
}

type SortField = 'changeNumber' | 'title' | 'type' | 'status' | 'riskLevel' | 'scheduledStart' | 'createdAt' | 'updatedAt';
type SortDir = 'asc' | 'desc';

function getRiskStyle(risk: string): { bg: string; text: string } {
  switch (risk) {
    case 'LOW':      return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'MEDIUM':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'HIGH':     return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'CRITICAL': return { bg: '#450a0a', text: '#fca5a5' };
    default:         return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Change List Page ─────────────────────────────────────────────────────────

export default function ChangesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error } = useQuery<ChangeListResponse>({
    queryKey: ['changes', search, status, type, riskLevel, page, pageSize, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir,
      });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (riskLevel) params.set('riskLevel', riskLevel);
      const res = await fetch(`/api/v1/changes?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load changes: ${res.status}`);
      return res.json() as Promise<ChangeListResponse>;
    },
  });

  const changes = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir(field === 'changeNumber' || field === 'title' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sortIcon = (field: SortField) => {
    if (sortBy !== field) return mdiUnfoldMoreHorizontal;
    return sortDir === 'asc' ? mdiArrowUp : mdiArrowDown;
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiSwapHorizontal} size={1} color="var(--accent-primary)" />
          Change Management
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/dashboard/changes/calendar"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid var(--border-secondary)',
            }}
          >
            <Icon path={mdiCalendar} size={0.8} color="currentColor" />
            Calendar View
          </Link>
          <Link
            href="/dashboard/changes/new"
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
            New Change
          </Link>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="var(--text-placeholder)" />
          </div>
          <input
            type="search"
            placeholder="Search changes..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFilter} size={0.75} color="var(--text-placeholder)" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="ASSESSMENT">Assessment</option>
            <option value="APPROVAL_PENDING">Approval Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IMPLEMENTING">Implementing</option>
            <option value="REVIEW">Review</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Types</option>
          <option value="STANDARD">Standard</option>
          <option value="NORMAL">Normal</option>
          <option value="EMERGENCY">Emergency</option>
        </select>

        <select
          value={riskLevel}
          onChange={(e) => { setRiskLevel(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Risk Levels</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading changes...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
          {error instanceof Error ? error.message : 'Failed to load changes'}
        </div>
      ) : changes.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiSwapHorizontal} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No changes found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                {([
                  ['changeNumber', 'Change #', 'nowrap'],
                  ['title', 'Title', ''],
                  ['type', 'Type', 'nowrap'],
                  ['status', 'Status', 'nowrap'],
                  ['riskLevel', 'Risk', 'nowrap'],
                  [null, 'Requested By', 'nowrap'],
                  ['scheduledStart', 'Scheduled', 'nowrap'],
                  ['createdAt', 'Created', 'nowrap'],
                  ['updatedAt', 'Updated', 'nowrap'],
                ] as [SortField | null, string, string][]).map(([field, label, ws]) => (
                  <th
                    key={label}
                    onClick={field ? () => toggleSort(field) : undefined}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      whiteSpace: ws === 'nowrap' ? 'nowrap' : undefined,
                      cursor: field ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {label}
                      {field && (
                        <Icon
                          path={sortIcon(field)}
                          size={0.55}
                          color={sortBy === field ? 'var(--accent-primary)' : 'var(--text-placeholder)'}
                        />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => {
                const statusStyle = getStatusStyle(change.status);
                const riskStyle = getRiskStyle(change.riskLevel);
                const isEmergency = change.type === 'EMERGENCY';
                return (
                  <tr key={change.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/changes/${change.id}`}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                      >{formatChangeNumber(change.changeNumber)}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={`/dashboard/changes/${change.id}`}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {change.title}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: isEmergency ? 'var(--badge-red-bg)' : 'var(--bg-tertiary)',
                        color: isEmergency ? '#991b1b' : '#374151',
                      }}>
                        {change.type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {change.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: riskStyle.bg, color: riskStyle.text }}>
                        {change.riskLevel}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {requestedByLabel(change)}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatDate(change.scheduledStart)}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatDateTime(change.createdAt)}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatDateTime(change.updatedAt)}
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
            Page {page} of {totalPages} ({total} changes)
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
