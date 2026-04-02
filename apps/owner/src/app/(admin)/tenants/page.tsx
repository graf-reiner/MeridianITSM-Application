'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ownerFetch } from '../../../lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  plan: string;
  createdAt: string;
  subscription?: {
    status: string;
    trialEnd?: string;
    currentPeriodEnd?: string;
  } | null;
}

interface TenantsResponse {
  tenants: Tenant[];
  total: number;
  page: number;
  pageCount: number;
}

const PLAN_OPTIONS = ['', 'STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'];
const STATUS_OPTIONS = ['', 'ACTIVE', 'SUSPENDED', 'DELETED'];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebounce(search, 300);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (plan) params.set('plan', plan);
    if (status) params.set('status', status);
    params.set('page', String(page));

    try {
      const r = await ownerFetch(`/api/tenants?${params.toString()}`);
      const data = (await r.json()) as TenantsResponse;
      setTenants(data.tenants ?? []);
      setTotal(data.total ?? 0);
      setPageCount(data.pageCount ?? 1);
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, plan, status, page]);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, plan, status]);

  const selectStyle = {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#374151',
    backgroundColor: '#fff',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>
          Tenants{total > 0 && <span style={{ fontSize: '16px', color: '#6b7280', fontWeight: '400', marginLeft: '8px' }}>({total})</span>}
        </h1>
        <Link
          href="/tenants/provision"
          style={{
            display: 'inline-block',
            padding: '9px 18px',
            backgroundColor: '#4f46e5',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          + Provision Tenant
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...selectStyle,
            minWidth: '240px',
            flex: '1',
          }}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} style={selectStyle}>
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p || 'All Plans'}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || 'All Statuses'}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Name', 'Slug', 'Plan', 'Status', 'Created', 'Actions'].map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Loading...
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  No tenants found
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500', color: '#111827' }}>
                    {t.name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                    {t.slug}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{t.plan}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor:
                          t.status === 'ACTIVE'
                            ? '#d1fae5'
                            : t.status === 'SUSPENDED'
                              ? '#fee2e2'
                              : '#f3f4f6',
                        color:
                          t.status === 'ACTIVE'
                            ? '#065f46'
                            : t.status === 'SUSPENDED'
                              ? '#991b1b'
                              : '#374151',
                      }}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link
                      href={`/tenants/${t.id}`}
                      style={{
                        fontSize: '13px',
                        color: '#4f46e5',
                        textDecoration: 'none',
                        fontWeight: '500',
                      }}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '7px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              backgroundColor: '#fff',
              color: page === 1 ? '#9ca3af' : '#374151',
            }}
          >
            Previous
          </button>
          <span style={{ padding: '7px 14px', fontSize: '13px', color: '#6b7280' }}>
            Page {page} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page === pageCount}
            style={{
              padding: '7px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: page === pageCount ? 'not-allowed' : 'pointer',
              backgroundColor: '#fff',
              color: page === pageCount ? '#9ca3af' : '#374151',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
