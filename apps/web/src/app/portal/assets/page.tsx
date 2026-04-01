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
    case 'DEPLOYED':  return { bg: 'var(--badge-green-bg)', text: '#065f46', label: 'Deployed' };
    case 'IN_STOCK':  return { bg: 'var(--badge-blue-bg)', text: '#1e40af', label: 'In Stock' };
    case 'IN_REPAIR': return { bg: 'var(--badge-yellow-bg)', text: '#92400e', label: 'In Repair' };
    case 'RETIRED':   return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)', label: 'Retired' };
    case 'DISPOSED':  return { bg: 'var(--badge-red-bg)', text: '#991b1b', label: 'Disposed' };
    default:          return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)', label: status };
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
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{ width: 44, height: 44, backgroundColor: 'var(--bg-tertiary)', borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ width: 100, height: 14, backgroundColor: 'var(--bg-tertiary)', borderRadius: 4 }} />
        <div style={{ width: 200, height: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 4 }} />
        <div style={{ width: 120, height: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 4 }} />
      </div>
      <div style={{ width: 70, height: 22, backgroundColor: 'var(--bg-tertiary)', borderRadius: 20 }} />
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
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
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
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-primary)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          backgroundColor: 'var(--badge-indigo-bg)',
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
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
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
        <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-secondary)' }}>
          {[asset.manufacturer, asset.model].filter(Boolean).join(' ') || 'Unknown device'}
        </p>

        {/* Hostname */}
        {asset.hostname && (
          <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-muted)' }}>
            {asset.hostname}
          </p>
        )}

        {/* Warranty */}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-placeholder)' }}>
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
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 16,
        padding: '60px 40px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          backgroundColor: 'var(--badge-indigo-bg)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}
      >
        <Icon path={mdiLaptop} size={1.6} color="#4f46e5" />
      </div>

      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        No assets assigned to you
      </h2>
      <p
        style={{
          margin: 0,
          color: 'var(--text-muted)',
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
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          My Assets
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
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
            color: 'var(--accent-danger)',
            backgroundColor: 'var(--bg-primary)',
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
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-placeholder)', textAlign: 'center' }}>
            {data?.total === 1 ? '1 asset assigned to you' : `${data?.total ?? 0} assets assigned to you`}
          </p>
        </div>
      )}
    </div>
  );
}
