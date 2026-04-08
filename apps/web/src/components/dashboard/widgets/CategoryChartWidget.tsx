'use client';

import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface DashboardStats {
  topCategories: Array<{ categoryName: string; count: number }>;
}

const PIE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626'];

export default function CategoryChartWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load data');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  const title = config.title || 'Category Breakdown';

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
      ) : !data?.topCategories?.length ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-placeholder)', fontSize: 14 }}>
          No category data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.topCategories}
              dataKey="count"
              nameKey="categoryName"
              cx="50%"
              cy="50%"
              outerRadius={70}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {data.topCategories.map((_, idx) => (
                <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </WidgetWrapper>
  );
}
