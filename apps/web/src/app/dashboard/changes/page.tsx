'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiSwapHorizontal, mdiPlus, mdiCalendar, mdiMagnify, mdiFilter } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Change {
  id: string;
  changeNumber: string;
  title: string;
  type: string;
  status: string;
  riskLevel: string;
  requestedBy: { firstName: string; lastName: string } | null;
  scheduledStart: string | null;
  createdAt: string;
}

interface ChangeListResponse {
  changes: Change[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'DRAFT':              return { bg: '#f3f4f6', text: '#6b7280' };
    case 'SUBMITTED':          return { bg: '#dbeafe', text: '#1e40af' };
    case 'PENDING_APPROVAL':   return { bg: '#fef3c7', text: '#92400e' };
    case 'APPROVED':           return { bg: '#d1fae5', text: '#065f46' };
    case 'REJECTED':           return { bg: '#fee2e2', text: '#991b1b' };
    case 'SCHEDULED':          return { bg: '#e0e7ff', text: '#3730a3' };
    case 'IN_PROGRESS':        return { bg: '#fef9c3', text: '#854d0e' };
    case 'COMPLETED':          return { bg: '#d1fae5', text: '#065f46' };
    case 'FAILED':             return { bg: '#fee2e2', text: '#991b1b' };
    case 'CANCELLED':          return { bg: '#f3f4f6', text: '#9ca3af' };
    default:                   return { bg: '#f3f4f6', text: '#374151' };
  }
}

function getRiskStyle(risk: string): { bg: string; text: string } {
  switch (risk) {
    case 'LOW':      return { bg: '#d1fae5', text: '#065f46' };
    case 'MEDIUM':   return { bg: '#fef3c7', text: '#92400e' };
    case 'HIGH':     return { bg: '#fee2e2', text: '#991b1b' };
    case 'CRITICAL': return { bg: '#450a0a', text: '#fca5a5' };
    default:         return { bg: '#f3f4f6', text: '#374151' };
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
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = useQuery<ChangeListResponse>({
    queryKey: ['changes', search, status, type, riskLevel, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      if (riskLevel) params.set('riskLevel', riskLevel);
      const res = await fetch(`/api/v1/changes?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load changes: ${res.status}`);
      return res.json() as Promise<ChangeListResponse>;
    },
  });

  const changes = data?.changes ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiSwapHorizontal} size={1} color="#4f46e5" />
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
              backgroundColor: '#fff',
              color: '#374151',
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid #d1d5db',
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
              backgroundColor: '#4f46e5',
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
            <Icon path={mdiMagnify} size={0.8} color="#9ca3af" />
          </div>
          <input
            type="search"
            placeholder="Search changes..."
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFilter} size={0.75} color="#9ca3af" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
        >
          <option value="">All Types</option>
          <option value="STANDARD">Standard</option>
          <option value="NORMAL">Normal</option>
          <option value="EMERGENCY">Emergency</option>
        </select>

        <select
          value={riskLevel}
          onChange={(e) => { setRiskLevel(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff' }}
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
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading changes...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          {error instanceof Error ? error.message : 'Failed to load changes'}
        </div>
      ) : changes.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiSwapHorizontal} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: '#6b7280', fontSize: 14 }}>No changes found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Change #</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Risk</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Requested By</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => {
                const statusStyle = getStatusStyle(change.status);
                const riskStyle = getRiskStyle(change.riskLevel);
                const isEmergency = change.type === 'EMERGENCY';
                return (
                  <tr key={change.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/changes/${change.id}`}
                        style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                      >
                        CHG-{change.changeNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={`/dashboard/changes/${change.id}`}
                        style={{ color: '#111827', textDecoration: 'none', fontWeight: 500 }}
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
                        backgroundColor: isEmergency ? '#fee2e2' : '#f3f4f6',
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
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {change.requestedBy ? `${change.requestedBy.firstName} ${change.requestedBy.lastName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatDate(change.scheduledStart)}
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
            Page {page} of {totalPages} ({total} changes)
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
