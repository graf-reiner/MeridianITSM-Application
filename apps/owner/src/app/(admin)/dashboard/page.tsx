'use client';

import { useEffect, useState } from 'react';
import RevenueChart from '../../../components/RevenueChart';

interface DashboardData {
  totalTenants: number;
  activeTenants: number;
  trialingTenants: number;
  suspendedTenants: number;
  mrr: number;
  arr: number;
  conversionRate: number;
  recentActivity: Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
    createdAt: string;
  }>;
  mrrHistory: Array<{ date: string; mrr: number; arr: number }>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '20px 24px',
        minWidth: '160px',
      }}
    >
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('owner_token') : null;
    fetch('/api/dashboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DashboardData>;
      })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ color: '#6b7280', padding: '48px', textAlign: 'center' }}>Loading dashboard...</div>;
  }

  if (error) {
    return <div style={{ color: '#ef4444', padding: '48px', textAlign: 'center' }}>Error: {error}</div>;
  }

  if (!data) return null;

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '24px' }}>
        Owner Dashboard
      </h1>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <StatCard label="Total Tenants" value={data.totalTenants} />
        <StatCard label="Active" value={data.activeTenants} sub={`${data.conversionRate}% conversion`} />
        <StatCard label="Trialing" value={data.trialingTenants} />
        <StatCard label="Suspended" value={data.suspendedTenants} />
        <StatCard label="MRR" value={formatCurrency(data.mrr)} />
        <StatCard label="ARR" value={formatCurrency(data.arr)} />
      </div>

      {/* Revenue chart */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '24px',
          marginBottom: '32px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          MRR / ARR Trend (Last 12 Months)
        </h2>
        <RevenueChart data={data.mrrHistory} />
      </div>

      {/* Recent activity */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '24px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
          Recent Tenants
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['Name', 'Slug', 'Plan', 'Status', 'Created'].map((col) => (
                <th
                  key={col}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
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
            {data.recentActivity.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 12px', fontSize: '14px', color: '#111827', fontWeight: '500' }}>
                  {t.name}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                  {t.slug}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '13px', color: '#6b7280' }}>{t.plan}</td>
                <td style={{ padding: '10px 12px' }}>
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
                <td style={{ padding: '10px 12px', fontSize: '13px', color: '#9ca3af' }}>
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
