'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiCertificate, mdiAlertCircle, mdiFilterVariant } from '@mdi/js';
import Breadcrumb from '@/components/Breadcrumb';

// ─── Types ────────────────────────────────────────────────────────────────────

type CertStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'NOTICE' | 'OK';

interface SslCertificateRow {
  applicationId: string;
  applicationName: string;
  ciId: string;
  ciName: string;
  url: string | null;
  certificateExpiryDate: string;
  certificateIssuer: string | null;
  daysUntilExpiry: number;
  status: CertStatus;
}

interface SslCertResponse {
  data: SslCertificateRow[];
  total: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<CertStatus, { bg: string; text: string; border: string; label: string }> = {
  EXPIRED:  { bg: 'var(--badge-red-bg)', text: '#991b1b', border: '#dc2626', label: 'Expired' },
  CRITICAL: { bg: 'var(--badge-red-bg-subtle)', text: '#dc2626', border: '#dc2626', label: 'Critical' },
  WARNING:  { bg: 'var(--badge-orange-bg)', text: '#9a3412', border: '#ea580c', label: 'Warning' },
  NOTICE:   { bg: 'var(--badge-yellow-bg-subtle)', text: '#854d0e', border: '#ca8a04', label: 'Notice' },
  OK:       { bg: 'var(--badge-green-bg-subtle)', text: '#065f46', border: '#22c55e', label: 'OK' },
};

const STATUS_ORDER: CertStatus[] = ['EXPIRED', 'CRITICAL', 'WARNING', 'NOTICE', 'OK'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(iso: string, days: number): string {
  const date = new Date(iso).toISOString().slice(0, 10);
  if (days < 0) return `${date} (expired ${Math.abs(days)}d ago)`;
  return `${date} (in ${days}d)`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SslCertificatesPage() {
  const [filter, setFilter] = useState<'ALL' | CertStatus>('ALL');

  const { data, isLoading, error } = useQuery<SslCertResponse>({
    queryKey: ['ssl-certificates'],
    queryFn: async () => {
      const res = await fetch('/api/v1/applications/ssl-certificates', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load certificates');
      return res.json() as Promise<SslCertResponse>;
    },
  });

  const counts = useMemo(() => {
    const c: Record<CertStatus, number> = { EXPIRED: 0, CRITICAL: 0, WARNING: 0, NOTICE: 0, OK: 0 };
    if (data?.data) for (const row of data.data) c[row.status] += 1;
    return c;
  }, [data]);

  const rows = useMemo(() => {
    if (!data?.data) return [];
    if (filter === 'ALL') return data.data;
    return data.data.filter((r) => r.status === filter);
  }, [data, filter]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { label: 'Applications', href: '/dashboard/applications' },
          { label: 'SSL Certificates' },
        ]}
      />

      {/* Header */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: '18px 22px',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: 'var(--badge-red-bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #dc2626',
            }}
          >
            <Icon path={mdiCertificate} size={1.3} color="#dc2626" />
          </div>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
              SSL Certificates
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Tenant-wide cert expiry tracking — fed by the APM ↔ CMDB bridge.
            </p>
          </div>
        </div>
      </div>

      {/* Status filter chips */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <Icon path={mdiFilterVariant} size={0.8} color="var(--text-muted)" />
        <button
          onClick={() => setFilter('ALL')}
          style={{
            padding: '6px 12px',
            border: filter === 'ALL' ? '1px solid var(--accent-primary)' : '1px solid var(--border-secondary)',
            backgroundColor: filter === 'ALL' ? 'var(--accent-primary)' : 'var(--bg-primary)',
            color: filter === 'ALL' ? 'var(--bg-primary)' : 'var(--text-secondary)',
            borderRadius: 18,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          All ({data?.total ?? 0})
        </button>
        {STATUS_ORDER.map((status) => {
          const c = STATUS_COLORS[status];
          const active = filter === status;
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                padding: '6px 12px',
                border: active ? `1px solid ${c.border}` : '1px solid var(--border-secondary)',
                backgroundColor: active ? c.bg : 'var(--bg-primary)',
                color: active ? c.text : 'var(--text-secondary)',
                borderRadius: 18,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {c.label} ({counts[status]})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-placeholder)' }}>Loading certificates…</div>
        ) : error ? (
          <div
            style={{
              padding: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--accent-danger)',
            }}
          >
            <Icon path={mdiAlertCircle} size={1} color="currentColor" />
            <span>Failed to load: {String(error)}</span>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Icon path={mdiCertificate} size={2} color="var(--text-placeholder)" />
            <p style={{ margin: '12px 0 4px', fontSize: 14, color: 'var(--text-secondary)' }}>
              No certificates match this filter.
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-placeholder)' }}>
              Add a CmdbCiEndpoint with a certificateExpiryDate, linked to an Application's primary CI.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                  {['Status', 'Application', 'Endpoint', 'URL', 'Issuer', 'Expiry'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const c = STATUS_COLORS[row.status];
                  return (
                    <tr
                      key={`${row.applicationId}-${row.ciId}`}
                      style={{ borderBottom: '1px solid var(--bg-tertiary)' }}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: c.bg,
                            color: c.text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.status === 'EXPIRED'
                            ? `EXPIRED ${Math.abs(row.daysUntilExpiry)}d`
                            : `${row.daysUntilExpiry}d`}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        <Link
                          href={`/dashboard/applications/${row.applicationId}`}
                          style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                        >
                          {row.applicationName}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <Link
                          href={`/dashboard/cmdb/${row.ciId}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          {row.ciName}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          color: 'var(--text-muted)',
                          wordBreak: 'break-all',
                          maxWidth: 280,
                        }}
                      >
                        {row.url ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {row.certificateIssuer ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                        {formatExpiry(row.certificateExpiryDate, row.daysUntilExpiry)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
