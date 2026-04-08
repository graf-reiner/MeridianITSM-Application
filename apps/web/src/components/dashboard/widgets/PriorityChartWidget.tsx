'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface DashboardStats {
  volumeByPriority: Array<{ priority: string; count: number }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#6b7280',
};

export default function PriorityChartWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load data');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  const title = config.title || 'Priority Distribution';

  return (
    <WidgetWrapper title={title} isEditing={isEditing} onRemove={isEditing ? () => onConfigChange?.(widgetId, { ...config, type: '__remove__' }) : undefined}>
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading...
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--accent-danger)', fontSize: 13 }}>
          Failed to load
        </div>
      ) : !data?.volumeByPriority?.length ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-placeholder)', fontSize: 14 }}>
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.volumeByPriority} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-tertiary)" />
            <XAxis dataKey="priority" tick={{ fontSize: 11, fill: 'var(--text-placeholder)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-placeholder)' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.volumeByPriority.map((entry) => (
                <Cell key={entry.priority} fill={PRIORITY_COLORS[entry.priority] ?? 'var(--text-muted)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </WidgetWrapper>
  );
}
