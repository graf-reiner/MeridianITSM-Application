'use client';

import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiLaptop, mdiMonitor, mdiServerNetwork, mdiDesktopClassic } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  assetTag: string | null;
  manufacturer: string | null;
  model: string | null;
  status: 'IN_STOCK' | 'DEPLOYED' | 'IN_REPAIR' | 'RETIRED' | 'DISPOSED';
  hostname: string | null;
  warrantyExpiry: string | null;
  site?: { id: string; name: string } | null;
}

interface AssetListResponse {
  data: Asset[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusBadge(status: Asset['status']): { bg: string; text: string; label: string } {
  switch (status) {
    case 'DEPLOYED':  return { bg: '#d1fae5', text: '#065f46', label: 'Deployed' };
    case 'IN_STOCK':  return { bg: '#dbeafe', text: '#1e40af', label: 'In Stock' };
    case 'IN_REPAIR': return { bg: '#fef3c7', text: '#92400e', label: 'In Repair' };
    case 'RETIRED':   return { bg: '#f3f4f6', text: '#6b7280', label: 'Retired' };
    case 'DISPOSED':  return { bg: '#fee2e2', text: '#991b1b', label: 'Disposed' };
    default:          return { bg: '#f3f4f6', text: '#374151', label: status };
  }
}

function getAssetIcon(manufacturer: string | null): string {
  if (!manufacturer) return mdiLaptop;
  const m = manufacturer.toLowerCase();
  if (m.includes('server') || m.includes('hp') || m.includes('dell')) return mdiServerNetwork;
  if (m.includes('apple') || m.includes('lenovo') || m.includes('asus')) return mdiLaptop;
  if (m.includes('monitor') || m.includes('display')) return mdiMonitor;
  return mdiDesktopClassic;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AssetCardSkeleton() {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{ width: 44, height: 44, backgroundColor: '#f3f4f6', borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ width: 100, height: 14, backgroundColor: '#f3f4f6', borderRadius: 4 }} />
        <div style={{ width: 200, height: 12, backgroundColor: '#f3f4f6', borderRadius: 4 }} />
        <div style={{ width: 120, height: 12, backgroundColor: '#f3f4f6', borderRadius: 4 }} />
      </div>
      <div style={{ width: 70, height: 22, backgroundColor: '#f3f4f6', borderRadius: 20 }} />
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: Asset }) {
  const badge = getStatusBadge(asset.status);
  const icon = getAssetIcon(asset.manufacturer);
  const warrantyDate = formatDate(asset.warrantyExpiry);

  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#c7d2fe';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 6px rgba(79,70,229,0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          backgroundColor: '#e0e7ff',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon path={icon} size={1.1} color="#4f46e5" />
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827', fontFamily: 'monospace' }}>
            {asset.assetTag ?? '—'}
          </span>
          {/* Status badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: badge.bg,
              color: badge.text,
            }}
          >
            {badge.label}
          </span>
        </div>

        {/* Manufacturer + model */}
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#374151' }}>
          {[asset.manufacturer, asset.model].filter(Boolean).join(' ') || 'Unknown device'}
        </p>

        {/* Hostname */}
        {asset.hostname && (
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>
            {asset.hostname}
          </p>
        )}

        {/* Warranty */}
        <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
          {warrantyDate ? `Warranty expires ${warrantyDate}` : 'No warranty info'}
        </p>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: '60px 40px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          backgroundColor: '#e0e7ff',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        <Icon path={mdiLaptop} size={1.6} color="#4f46e5" />
      </div>

      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#111827' }}>
        No assets assigned to you
      </h2>
      <p
        style={{
          margin: 0,
          color: '#6b7280',
          fontSize: 14,
          maxWidth: 380,
          marginLeft: 'auto',
          marginRight: 'auto',
          lineHeight: 1.6,
        }}
      >
        Your IT team will assign devices, software licenses, and equipment to your account here.
      </p>
    </div>
  );
}

// ─── My Assets Page ───────────────────────────────────────────────────────────

/**
 * Portal assets page — shows assets assigned to the current logged-in user.
 *
 * Requirement: PRTL-05
 * Fetches from GET /api/v1/assets?assignedToId=me (Next.js rewrite proxies to Fastify).
 * The backend resolves 'me' to the JWT userId for tenant-scoped, user-scoped filtering.
 */
export default function PortalAssetsPage() {
  const { data, isLoading, isError } = useQuery<AssetListResponse>({
    queryKey: ['portal-assets'],
    queryFn: () =>
      fetch('/api/v1/assets?assignedToId=me', { credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error(`Failed to load assets: ${r.status}`);
        return r.json() as Promise<AssetListResponse>;
      }),
  });

  const assets = data?.data ?? [];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
          My Assets
        </h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
          Hardware and software assigned to you
        </p>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AssetCardSkeleton />
          <AssetCardSkeleton />
          <AssetCardSkeleton />
        </div>
      ) : isError ? (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            color: '#dc2626',
            backgroundColor: '#fff',
            border: '1px solid #fecaca',
            borderRadius: 12,
          }}
        >
          Failed to load assets. Please try refreshing the page.
        </div>
      ) : assets.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}

          {/* Asset count */}
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
            {data?.total === 1 ? '1 asset assigned to you' : `${data?.total ?? 0} assets assigned to you`}
          </p>
        </div>
      )}
    </div>
  );
}
