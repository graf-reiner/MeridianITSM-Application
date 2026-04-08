'use client';

import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiTicketOutline, mdiCheckCircle, mdiAlertCircle, mdiCounter } from '@mdi/js';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  resolvedToday: number;
  overdueTickets: number;
}

const METRIC_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; key: keyof DashboardStats }> = {
  openTickets: { label: 'Open Tickets', icon: mdiTicketOutline, color: '#0891b2', bg: 'rgba(8,145,178,0.12)', key: 'openTickets' },
  resolvedToday: { label: 'Resolved Today', icon: mdiCheckCircle, color: '#059669', bg: 'rgba(5,150,105,0.12)', key: 'resolvedToday' },
  overdueTickets: { label: 'SLA Breached', icon: mdiAlertCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.12)', key: 'overdueTickets' },
  totalTickets: { label: 'Total Tickets', icon: mdiCounter, color: '#4f46e5', bg: 'rgba(79,70,229,0.12)', key: 'totalTickets' },
};

export default function StatCardWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const metric = (config.config?.metric as string) || 'openTickets';
  const cfg = METRIC_CONFIG[metric] || METRIC_CONFIG.openTickets;

  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load stats');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  const title = config.title || cfg.label;
  const value = data ? data[cfg.key] : 0;

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
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: '100%' }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: cfg.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon path={cfg.icon} size={1.1} color={cfg.color} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              {value.toLocaleString()}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {cfg.label}
            </p>
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
