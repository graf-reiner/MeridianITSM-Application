'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiDesktopClassic, mdiPlus, mdiMagnify, mdiFilter } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  assetTag: string;
  manufacturer: string | null;
  model: string | null;
  status: string;
  assignedTo: { firstName: string; lastName: string } | null;
  site: { name: string } | null;
  warrantyExpiry: string | null;
}

interface AssetListResponse {
  assets: Asset[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'DEPLOYED':    return { bg: '#d1fae5', text: '#065f46' };
    case 'IN_STOCK':    return { bg: '#dbeafe', text: '#1e40af' };
    case 'IN_REPAIR':   return { bg: '#fef3c7', text: '#92400e' };
    case 'RETIRED':     return { bg: '#f3f4f6', text: '#6b7280' };
    case 'DISPOSED':    return { bg: '#f3f4f6', text: '#9ca3af' };
    default:            return { bg: '#f3f4f6', text: '#374151' };
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Asset List Page ──────────────────────────────────────────────────────────

export default function AssetsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [siteId, setSiteId] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data, isLoading, error } = useQuery<AssetListResponse>({
    queryKey: ['assets', search, status, siteId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (siteId) params.set('siteId', siteId);
      const res = await fetch(`/api/v1/assets?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load assets: ${res.status}`);
      return res.json() as Promise<AssetListResponse>;
    },
  });

  const assets = data?.assets ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiDesktopClassic} size={1} color="#4f46e5" />
          Assets
        </h1>
        <Link
          href="/dashboard/assets/new"
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
          New Asset
        </Link>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="#9ca3af" />
          </div>
          <input
            type="search"
            placeholder="Search assets..."
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
            <option value="IN_STOCK">In Stock</option>
            <option value="DEPLOYED">Deployed</option>
            <option value="IN_REPAIR">In Repair</option>
            <option value="RETIRED">Retired</option>
            <option value="DISPOSED">Disposed</option>
          </select>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading assets...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          {error instanceof Error ? error.message : 'Failed to load assets'}
        </div>
      ) : assets.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiDesktopClassic} size={2.5} color="#d1d5db" />
          <p style={{ margin: '16px 0 0', color: '#6b7280', fontSize: 14 }}>No assets found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Asset Tag</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Make / Model</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Assigned To</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Site</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Warranty Expiry</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const style = getStatusStyle(asset.status);
                return (
                  <tr key={asset.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/assets/${asset.id}`}
                        style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                      >
                        {asset.assetTag}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>
                      {[asset.manufacturer, asset.model].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: style.bg, color: style.text }}>
                        {asset.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13 }}>
                      {asset.site?.name ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatDate(asset.warrantyExpiry)}
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
            Page {page} of {totalPages} ({total} assets)
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
