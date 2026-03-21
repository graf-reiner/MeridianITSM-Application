'use client';

import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiChartBar,
  mdiTicketOutline,
  mdiCheckCircle,
  mdiAlertCircle,
  mdiDownload,
  mdiClockOutline,
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
  ticketVolumeByDay: Array<{ date: string; count: number }>;
  ticketsByPriority: Array<{ priority: string; count: number }>;
  topCategories: Array<{ name: string; count: number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    ticketNumber: string | null;
    actor: { firstName: string; lastName: string } | null;
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
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
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
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 700, color: '#111827' }}>{value.toLocaleString()}</p>
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

// ─── Reports Page ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load dashboard data');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading reports...</div>;
  }

  if (error || !stats) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
        {error instanceof Error ? error.message : 'Failed to load dashboard data'}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiChartBar} size={1} color="#4f46e5" />
          Reports
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href="/api/v1/reports/tickets?format=csv"
            download
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', textDecoration: 'none', backgroundColor: '#fff' }}
          >
            <Icon path={mdiDownload} size={0.8} color="currentColor" />
            Export Tickets CSV
          </a>
          <a
            href="/api/v1/reports/sla-compliance"
            download
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#374151', textDecoration: 'none', backgroundColor: '#fff' }}
          >
            <Icon path={mdiDownload} size={0.8} color="currentColor" />
            SLA Report
          </a>
        </div>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Tickets" value={stats.totalTickets} icon={mdiTicketOutline} color="#4f46e5" bg="#eef2ff" />
        <StatCard label="Open Tickets" value={stats.openTickets} icon={mdiTicketOutline} color="#0891b2" bg="#e0f2fe" />
        <StatCard label="Resolved Today" value={stats.resolvedToday} icon={mdiCheckCircle} color="#059669" bg="#d1fae5" />
        <StatCard label="SLA Breached" value={stats.overdueTickets} icon={mdiAlertCircle} color="#dc2626" bg="#fee2e2" />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 32 }}>

        {/* Ticket volume line chart */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Ticket Volume (last 30 days)</h2>
          {stats.ticketVolumeByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.ticketVolumeByDay} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  labelFormatter={(v: unknown) => {
                    const dateStr = String(v);
                    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
              No data yet
            </div>
          )}
        </div>

        {/* Priority bar chart */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Tickets by Priority</h2>
          {stats.ticketsByPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.ticketsByPriority} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="priority" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stats.ticketsByPriority.map((entry) => (
                    <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Top categories pie chart */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Top Categories</h2>
          {stats.topCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.topCategories}
                  dataKey="count"
                  nameKey="name"
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
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
              No category data yet
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Recent Activity</h2>
          {stats.recentActivity.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 14 }}>No recent activity</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.recentActivity.map((act) => (
                <div key={act.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon path={mdiClockOutline} size={0.7} color="#d1d5db" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                      <strong>{act.actor ? `${act.actor.firstName} ${act.actor.lastName}` : 'System'}</strong>
                      {' '}{act.action.replace(/_/g, ' ').toLowerCase()}
                      {act.ticketNumber && <span style={{ color: '#4f46e5' }}> {act.ticketNumber}</span>}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>
                      {new Date(act.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
