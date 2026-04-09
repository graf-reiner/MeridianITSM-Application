'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiChartBar,
  mdiTicketOutline,
  mdiCheckCircle,
  mdiAlertCircle,
  mdiDownload,
  mdiClockOutline,
  mdiShieldCheck,
  mdiSwapHorizontal,
} from '@mdi/js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  resolvedToday: number;
  overdueTickets: number;
  volumeByDay: Array<{ day: string; count: number }>;
  volumeByPriority: Array<{ priority: string; count: number }>;
  topCategories: Array<{ categoryName: string; count: number }>;
  recentActivity: Array<{
    id: string;
    activityType: string;
    ticketId: string | null;
    actorId: string | null;
    fieldName: string | null;
    createdAt: string;
  }>;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon path={icon} size={1.1} color={color} />
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

// ─── Priority colors ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#6b7280',
};

const PIE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626'];

interface SlaCompliance {
  totalTickets: number;
  breachedTickets: number;
  complianceRate: number;
  avgResponseMinutes: number;
  avgResolutionMinutes: number;
  byPriority: Array<{
    priority: string;
    total: number;
    breached: number;
    avgResponseMinutes: number;
    avgResolutionMinutes: number;
  }>;
}

interface ChangeStats {
  totalChanges: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byRiskLevel: Record<string, number>;
}

type DateRange = '7d' | '30d' | '90d';

// ─── Reports Page ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', dateRange],
    queryFn: async () => {
      const days = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30;
      const res = await fetch(`/api/v1/dashboard?days=${days}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load dashboard data');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  const { data: slaData } = useQuery<SlaCompliance | null>({
    queryKey: ['sla-compliance'],
    queryFn: async () => {
      const res = await fetch('/api/v1/reports/sla-compliance', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<SlaCompliance>;
    },
    staleTime: 120_000,
  });

  const { data: changeData } = useQuery<ChangeStats | null>({
    queryKey: ['change-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/reports/changes', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<ChangeStats>;
    },
    staleTime: 120_000,
  });

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading reports...</div>;
  }

  if (error || !stats) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
        {error instanceof Error ? error.message : 'Failed to load dashboard data'}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiChartBar} size={1} color="var(--accent-primary)" />
          Reports
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Date range selector */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
            {(['7d', '30d', '90d'] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: dateRange === range ? 'var(--accent-primary)' : 'var(--bg-primary)',
                  color: dateRange === range ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
          <a
            href="/api/v1/reports/tickets?format=csv"
            download
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none', backgroundColor: 'var(--bg-primary)' }}
          >
            <Icon path={mdiDownload} size={0.8} color="currentColor" />
            Export Tickets CSV
          </a>
          <a
            href="/api/v1/reports/sla-compliance"
            download
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none', backgroundColor: 'var(--bg-primary)' }}
          >
            <Icon path={mdiDownload} size={0.8} color="currentColor" />
            SLA Report
          </a>
        </div>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Tickets" value={stats.totalTickets} icon={mdiTicketOutline} color="#4f46e5" bg="var(--badge-indigo-bg)" />
        <StatCard label="Open Tickets" value={stats.openTickets} icon={mdiTicketOutline} color="#0891b2" bg="var(--badge-blue-bg-subtle)" />
        <StatCard label="Resolved Today" value={stats.resolvedToday} icon={mdiCheckCircle} color="#059669" bg="var(--badge-green-bg)" />
        <StatCard label="SLA Breached" value={stats.overdueTickets} icon={mdiAlertCircle} color="#dc2626" bg="var(--badge-red-bg)" />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 32 }}>

        {/* Ticket volume line chart */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Ticket Volume (last 30 days)</h2>
          {stats.volumeByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.volumeByDay} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-tertiary)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: 'var(--text-placeholder)' }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-placeholder)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  labelFormatter={(v: unknown) => {
                    const dateStr = String(v);
                    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
              No data yet
            </div>
          )}
        </div>

        {/* Priority bar chart */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Tickets by Priority</h2>
          {stats.volumeByPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.volumeByPriority} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-tertiary)" />
                <XAxis dataKey="priority" tick={{ fontSize: 11, fill: 'var(--text-placeholder)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-placeholder)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.volumeByPriority.map((entry) => (
                    <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] ?? 'var(--text-muted)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Top categories pie chart */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Top Categories</h2>
          {stats.topCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.topCategories}
                  dataKey="count"
                  nameKey="categoryName"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {stats.topCategories.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
              No category data yet
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Recent Activity</h2>
          {stats.recentActivity.length === 0 ? (
            <p style={{ color: 'var(--text-placeholder)', fontSize: 14 }}>No recent activity</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.recentActivity.map((act) => (
                <div key={act.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon path={mdiClockOutline} size={0.7} color="var(--border-secondary)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      <strong>{act.actorId ? 'User' : 'System'}</strong>
                      {' '}{act.activityType.replace(/_/g, ' ').toLowerCase()}
                      {act.fieldName && <span style={{ color: 'var(--text-muted)' }}> ({act.fieldName})</span>}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-placeholder)' }}>
                      {new Date(act.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SLA Compliance & Change Stats ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>

        {/* SLA Compliance */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiShieldCheck} size={0.8} color="#059669" />
            SLA Compliance
          </h2>
          {slaData ? (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: '12px 14px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: slaData.complianceRate >= 90 ? '#059669' : slaData.complianceRate >= 70 ? '#d97706' : '#dc2626' }}>
                    {slaData.complianceRate.toFixed(1)}%
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Compliance Rate</p>
                </div>
                <div style={{ flex: 1, padding: '12px 14px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {slaData.breachedTickets}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Breached</p>
                </div>
              </div>
              {slaData.byPriority.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Priority</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Total</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Breached</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Avg Response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slaData.byPriority.map((row) => (
                      <tr key={row.priority} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '6px 8px', color: PRIORITY_COLORS[row.priority] ?? 'var(--text-secondary)', fontWeight: 600 }}>{row.priority}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{row.total}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: row.breached > 0 ? '#dc2626' : 'var(--text-muted)' }}>{row.breached}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{row.avgResponseMinutes > 0 ? `${Math.round(row.avgResponseMinutes)}m` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-placeholder)', fontSize: 14 }}>Loading SLA data...</p>
          )}
        </div>

        {/* Change Management Stats */}
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiSwapHorizontal} size={0.8} color="#7c3aed" />
            Change Management
          </h2>
          {changeData ? (
            <>
              <div style={{ padding: '12px 14px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {changeData.totalChanges}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Total Changes</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* By Type */}
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>By Type</p>
                  {Object.entries(changeData.byType).map(([type, count]) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{type.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{count as number}</span>
                    </div>
                  ))}
                </div>
                {/* By Risk */}
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>By Risk</p>
                  {Object.entries(changeData.byRiskLevel).map(([risk, count]) => (
                    <div key={risk} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{risk}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-placeholder)', fontSize: 14 }}>Loading change data...</p>
          )}
        </div>
      </div>
    </div>
  );
}
