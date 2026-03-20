'use client';

import { useState, useEffect, useCallback } from 'react';

type SubscriptionStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

interface TenantBillingRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  planName: string;
  subscriptionStatus: SubscriptionStatus;
  mrr: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface BillingOverview {
  totalMrr: number;
  totalArr: number;
  byStatus: Record<SubscriptionStatus, number>;
  totalTenants: number;
}

interface BillingData {
  overview: BillingOverview;
  tenants: TenantBillingRow[];
}

const STATUS_COLORS: Record<SubscriptionStatus, { bg: string; text: string }> = {
  ACTIVE: { bg: '#dcfce7', text: '#166534' },
  TRIALING: { bg: '#dbeafe', text: '#1e40af' },
  PAST_DUE: { bg: '#fef3c7', text: '#92400e' },
  CANCELED: { bg: '#fee2e2', text: '#991b1b' },
  SUSPENDED: { bg: '#f3f4f6', text: '#374151' },
};

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('owner_access_token');
}

function formatCurrency(usd: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryResults, setRetryResults] = useState<Record<string, string>>({});

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/billing', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: BillingData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBilling();
  }, [fetchBilling]);

  async function handleRetry(tenantId: string) {
    setRetryingId(tenantId);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/billing/${tenantId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { success?: boolean; newStatus?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRetryResults(prev => ({ ...prev, [tenantId]: `Success — new status: ${json.newStatus ?? 'paid'}` }));
      await fetchBilling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Retry failed';
      setRetryResults(prev => ({ ...prev, [tenantId]: `Error: ${msg}` }));
    } finally {
      setRetryingId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '64px', color: '#6b7280' }}>
        Loading billing data...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
        Error: {error}
      </div>
    );
  }

  if (!data) return null;

  const { overview, tenants } = data;

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>Billing Dashboard</h1>
        <p style={{ color: '#6b7280', marginTop: '4px' }}>Revenue overview and per-tenant billing status</p>
      </div>

      {/* Revenue Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Monthly Recurring Revenue
          </p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: '8px 0 0' }}>
            {formatCurrency(overview.totalMrr)}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>MRR</p>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Annual Recurring Revenue
          </p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: '8px 0 0' }}>
            {formatCurrency(overview.totalArr)}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>ARR (MRR x 12)</p>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Active Tenants
          </p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: '#111827', margin: '8px 0 0' }}>
            {(overview.byStatus.ACTIVE ?? 0) + (overview.byStatus.TRIALING ?? 0)}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>Active + Trialing</p>
        </div>

        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Past Due
          </p>
          <p style={{ fontSize: '28px', fontWeight: '700', color: (overview.byStatus.PAST_DUE ?? 0) > 0 ? '#dc2626' : '#111827', margin: '8px 0 0' }}>
            {overview.byStatus.PAST_DUE ?? 0}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>Require attention</p>
        </div>
      </div>

      {/* Status Breakdown */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '20px', border: '1px solid #e5e7eb', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 16px' }}>Subscription Status Breakdown</h2>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {(Object.entries(overview.byStatus) as [SubscriptionStatus, number][]).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  padding: '2px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: '600',
                  backgroundColor: STATUS_COLORS[status]?.bg ?? '#f3f4f6',
                  color: STATUS_COLORS[status]?.text ?? '#374151',
                }}
              >
                {status}
              </span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Tenant Billing Table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>Tenant Billing Details</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                {['Tenant', 'Plan', 'Status', 'MRR', 'Period End', 'Actions'].map(col => (
                  <th key={col} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant, idx) => (
                <tr
                  key={tenant.tenantId}
                  style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <p style={{ margin: 0, fontWeight: '500', color: '#111827', fontSize: '14px' }}>{tenant.tenantName}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{tenant.tenantSlug}</p>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>{tenant.planName}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '2px 10px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: STATUS_COLORS[tenant.subscriptionStatus]?.bg ?? '#f3f4f6',
                        color: STATUS_COLORS[tenant.subscriptionStatus]?.text ?? '#374151',
                      }}
                    >
                      {tenant.subscriptionStatus}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', fontWeight: '500' }}>
                    {formatCurrency(tenant.mrr)}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>
                    {tenant.currentPeriodEnd
                      ? new Date(tenant.currentPeriodEnd).toLocaleDateString()
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {tenant.subscriptionStatus === 'PAST_DUE' && (
                      <div>
                        <button
                          onClick={() => void handleRetry(tenant.tenantId)}
                          disabled={retryingId === tenant.tenantId}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            backgroundColor: retryingId === tenant.tenantId ? '#9ca3af' : '#dc2626',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: retryingId === tenant.tenantId ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {retryingId === tenant.tenantId ? 'Retrying...' : 'Retry Payment'}
                        </button>
                        {retryResults[tenant.tenantId] && (
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: retryResults[tenant.tenantId]?.startsWith('Error') ? '#dc2626' : '#166534' }}>
                            {retryResults[tenant.tenantId]}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                    No tenants found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
