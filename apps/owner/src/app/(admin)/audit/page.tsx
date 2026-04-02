'use client';

import { useState, useEffect, useCallback } from 'react';
import { ownerFetch } from '../../../lib/api';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT' | 'ASSIGN' | 'ESCALATE';

interface AuditLogEntry {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  action: AuditAction;
  resource: string;
  resourceId: string | null;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageCount: number;
}

const ACTION_COLORS: Record<AuditAction, { bg: string; text: string }> = {
  CREATE: { bg: '#dcfce7', text: '#166534' },
  UPDATE: { bg: '#dbeafe', text: '#1e40af' },
  DELETE: { bg: '#fee2e2', text: '#991b1b' },
  LOGIN: { bg: '#f0fdf4', text: '#166534' },
  LOGOUT: { bg: '#f9fafb', text: '#374151' },
  APPROVE: { bg: '#dcfce7', text: '#166534' },
  REJECT: { bg: '#fee2e2', text: '#991b1b' },
  ASSIGN: { bg: '#ede9fe', text: '#5b21b6' },
  ESCALATE: { bg: '#fef3c7', text: '#92400e' },
};

const ALL_ACTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'ASSIGN', 'ESCALATE'];

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  return qs.toString() ? `?${qs.toString()}` : '';
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterTenantId, setFilterTenantId] = useState('');
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('');
  const [filterResource, setFilterResource] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const fetchAuditLog = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        page: currentPage,
        limit: LIMIT,
        tenantId: filterTenantId || undefined,
        action: filterAction || undefined,
        resource: filterResource || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
      });
      const res = await ownerFetch(`/api/audit${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AuditResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [filterTenantId, filterAction, filterResource, filterStartDate, filterEndDate]);

  useEffect(() => {
    void fetchAuditLog(page);
  }, [fetchAuditLog, page]);

  function applyFilters() {
    setPage(1);
    void fetchAuditLog(1);
  }

  function clearFilters() {
    setFilterTenantId('');
    setFilterAction('');
    setFilterResource('');
    setFilterStartDate('');
    setFilterEndDate('');
    setPage(1);
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>Audit Log</h1>
        <p style={{ color: '#6b7280', marginTop: '4px' }}>
          Cross-tenant audit trail — all actions across all tenants (owner-only access)
        </p>
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', margin: '0 0 16px' }}>Filters</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
            Tenant ID
            <input
              type="text"
              value={filterTenantId}
              onChange={e => setFilterTenantId(e.target.value)}
              placeholder="UUID filter..."
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
            Action
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value as AuditAction | '')}
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}
            >
              <option value="">All actions</option>
              {ALL_ACTIONS.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
            Resource Type
            <input
              type="text"
              value={filterResource}
              onChange={e => setFilterResource(e.target.value)}
              placeholder="e.g. ticket, user, asset"
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
            Start Date
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: '12px', fontWeight: '500', color: '#374151' }}>
            End Date
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={applyFilters}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: '500', backgroundColor: '#4338ca', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Apply Filters
          </button>
          <button
            onClick={clearFilters}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: '500', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#991b1b', marginBottom: '16px', fontSize: '14px' }}>
          Error: {error}
        </div>
      )}

      {/* Audit Log Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#111827' }}>
            Audit Log
            {data && <span style={{ marginLeft: '8px', fontSize: '13px', fontWeight: '400', color: '#6b7280' }}>({data.total.toLocaleString()} total)</span>}
          </h2>
          {loading && <span style={{ fontSize: '13px', color: '#6b7280' }}>Loading...</span>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                {['Timestamp', 'Tenant', 'User', 'Action', 'Resource', 'Resource ID', 'IP Address', ''].map(col => (
                  <th
                    key={col}
                    style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.logs ?? []).map(log => (
                <>
                  <tr
                    key={log.id}
                    style={{ borderBottom: expandedId === log.id ? 'none' : '1px solid #f3f4f6', cursor: 'pointer' }}
                    onClick={() => toggleExpand(log.id)}
                  >
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#111827', fontWeight: '500' }}>{log.tenantName}</p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>{log.tenantSlug}</p>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <p style={{ margin: 0, fontSize: '12px', color: '#374151' }}>{log.userEmail ?? '—'}</p>
                      {log.userName && <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>{log.userName}</p>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: ACTION_COLORS[log.action]?.bg ?? '#f3f4f6',
                          color: ACTION_COLORS[log.action]?.text ?? '#374151',
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{log.resource}</td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>
                      {log.resourceId ? log.resourceId.slice(0, 8) + '...' : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: '#6b7280' }}>{log.ipAddress ?? '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#4338ca' }}>
                      {(log.oldData !== null || log.newData !== null) ? (expandedId === log.id ? 'Collapse' : 'Expand') : ''}
                    </td>
                  </tr>
                  {expandedId === log.id && (log.oldData !== null || log.newData !== null) && (
                    <tr key={`${log.id}-expanded`} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                      <td colSpan={8} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          {log.oldData !== null && (
                            <div>
                              <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '600', color: '#374151', textTransform: 'uppercase' }}>Before (Old Data)</p>
                              <pre style={{ margin: 0, fontSize: '11px', backgroundColor: '#fee2e2', padding: '10px', borderRadius: '4px', overflow: 'auto', maxHeight: '200px', color: '#991b1b' }}>
                                {JSON.stringify(log.oldData, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.newData !== null && (
                            <div>
                              <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '600', color: '#374151', textTransform: 'uppercase' }}>After (New Data)</p>
                              <pre style={{ margin: 0, fontSize: '11px', backgroundColor: '#dcfce7', padding: '10px', borderRadius: '4px', overflow: 'auto', maxHeight: '200px', color: '#166534' }}>
                                {JSON.stringify(log.newData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                        {log.userAgent && (
                          <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#6b7280' }}>
                            User Agent: {log.userAgent}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {!loading && (!data?.logs || data.logs.length === 0) && (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                    No audit log entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pageCount > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
              Page {data.page} of {data.pageCount} ({data.total.toLocaleString()} entries)
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: '#fff', color: page <= 1 ? '#9ca3af' : '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.pageCount, p + 1))}
                disabled={page >= data.pageCount}
                style={{ padding: '6px 12px', fontSize: '13px', backgroundColor: '#fff', color: page >= data.pageCount ? '#9ca3af' : '#374151', border: '1px solid #d1d5db', borderRadius: '4px', cursor: page >= data.pageCount ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
