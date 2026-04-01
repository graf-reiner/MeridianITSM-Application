'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiDatabase,
  mdiServer,
  mdiDesktopClassic,
  mdiLanConnect,
  mdiCloud,
  mdiCog,
  mdiApplication,
  mdiShieldLock,
  mdiPackageVariant,
  mdiPlus,
  mdiUpload,
  mdiMagnify,
  mdiFilter,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CI {
  id: string;
  ciNumber: string;
  name: string;
  type: string;
  status: string;
  environment: string | null;
  createdAt: string;
  category: { name: string } | null;
}

interface CIListResponse {
  cis?: CI[];
  data?: CI[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCITypeIcon(type: string): string {
  switch (type) {
    case 'SERVER':          return mdiServer;
    case 'WORKSTATION':     return mdiDesktopClassic;
    case 'NETWORK_DEVICE':  return mdiLanConnect;
    case 'DATABASE':        return mdiDatabase;
    case 'CLOUD_RESOURCE':  return mdiCloud;
    case 'SERVICE':         return mdiCog;
    case 'APPLICATION':     return mdiApplication;
    case 'SECURITY_DEVICE': return mdiShieldLock;
    case 'STORAGE':         return mdiPackageVariant;
    default:                return mdiServer;
  }
}

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'ACTIVE':       return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'MAINTENANCE':  return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'INACTIVE':     return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    case 'DECOMMISSIONED': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default:             return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function getEnvStyle(env: string | null): { bg: string; text: string } {
  switch (env) {
    case 'PRODUCTION':  return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'STAGING':     return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'DEVELOPMENT': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'TESTING':     return { bg: 'var(--badge-purple-bg-subtle)', text: '#6b21a8' };
    default:            return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
  }
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── CMDB CI List Page ────────────────────────────────────────────────────────

export default function CMDBPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [environment, setEnvironment] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = useQuery<CIListResponse>({
    queryKey: ['cmdb-cis', search, type, status, environment, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (environment) params.set('environment', environment);
      const res = await fetch(`/api/v1/cmdb/cis?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load CIs: ${res.status}`);
      return res.json() as Promise<CIListResponse>;
    },
  });

  const cis = data?.data ?? data?.cis ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiDatabase} size={1} color="var(--accent-primary)" />
          CMDB — Configuration Items
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/dashboard/cmdb/import"
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
            <Icon path={mdiUpload} size={0.8} color="currentColor" />
            Import CIs
          </Link>
          <Link
            href="/dashboard/cmdb/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New CI
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
            placeholder="Search CIs..."
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
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
          >
            <option value="">All Types</option>
            <option value="SERVER">Server</option>
            <option value="WORKSTATION">Workstation</option>
            <option value="NETWORK_DEVICE">Network Device</option>
            <option value="DATABASE">Database</option>
            <option value="CLOUD_RESOURCE">Cloud Resource</option>
            <option value="SERVICE">Service</option>
            <option value="APPLICATION">Application</option>
            <option value="SECURITY_DEVICE">Security Device</option>
            <option value="STORAGE">Storage</option>
          </select>
        </div>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DECOMMISSIONED">Decommissioned</option>
        </select>

        <select
          value={environment}
          onChange={(e) => { setEnvironment(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          <option value="">All Environments</option>
          <option value="PRODUCTION">Production</option>
          <option value="STAGING">Staging</option>
          <option value="DEVELOPMENT">Development</option>
          <option value="TESTING">Testing</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading CIs...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
          {error instanceof Error ? error.message : 'Failed to load CIs'}
        </div>
      ) : cis.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiDatabase} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No configuration items found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>CI Number</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Environment</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {cis.map((ci) => {
                const statusStyle = getStatusStyle(ci.status);
                const envStyle = getEnvStyle(ci.environment);
                return (
                  <tr key={ci.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/cmdb/${ci.id}`}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                      >
                        CI-{ci.ciNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link
                        href={`/dashboard/cmdb/${ci.id}`}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {ci.name}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <Icon path={getCITypeIcon(ci.type)} size={0.75} color="var(--text-muted)" />
                        {ci.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                        {ci.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {ci.environment ? (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: envStyle.bg, color: envStyle.text }}>
                          {ci.environment}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-placeholder)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {relativeTime(ci.createdAt)}
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
            Page {page} of {totalPages} ({total} CIs)
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
