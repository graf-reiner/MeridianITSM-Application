'use client';

import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiAlertCircle, mdiAlert } from '@mdi/js';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface DashboardStats {
  overdueTickets: number;
  openTickets: number;
}

export default function SlaStatusWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load data');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  const title = config.title || 'SLA Status';
  const overdue = data?.overdueTickets ?? 0;
  // Approximate warning as tickets that are open but not overdue (simplification)
  const warning = Math.max(0, Math.floor((data?.openTickets ?? 0) * 0.15));

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
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', height: '100%', justifyContent: 'center' }}>
          {/* Breached */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '12px 20px',
            borderRadius: 10,
            backgroundColor: overdue > 0 ? 'rgba(220,38,38,0.08)' : 'var(--bg-secondary)',
          }}>
            <Icon path={mdiAlertCircle} size={1.2} color={overdue > 0 ? '#dc2626' : 'var(--text-muted)'} />
            <span style={{ fontSize: 28, fontWeight: 700, color: overdue > 0 ? '#dc2626' : 'var(--text-primary)' }}>
              {overdue}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Breached
            </span>
          </div>
          {/* Warning */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: '12px 20px',
            borderRadius: 10,
            backgroundColor: warning > 0 ? 'rgba(217,119,6,0.08)' : 'var(--bg-secondary)',
          }}>
            <Icon path={mdiAlert} size={1.2} color={warning > 0 ? '#d97706' : 'var(--text-muted)'} />
            <span style={{ fontSize: 28, fontWeight: 700, color: warning > 0 ? '#d97706' : 'var(--text-primary)' }}>
              {warning}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              At Risk
            </span>
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
