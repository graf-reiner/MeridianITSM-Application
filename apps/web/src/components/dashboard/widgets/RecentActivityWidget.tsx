'use client';

import { useQuery } from '@tanstack/react-query';
import Icon from '@mdi/react';
import { mdiClockOutline } from '@mdi/js';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface ActivityItem {
  id: string;
  activityType: string;
  ticketId: string | null;
  actorId: string | null;
  fieldName: string | null;
  createdAt: string;
}

interface DashboardStats {
  recentActivity: ActivityItem[];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const ACTIVITY_COLORS: Record<string, string> = {
  CREATED: '#059669',
  UPDATED: '#0891b2',
  STATUS_CHANGED: '#d97706',
  ASSIGNED: '#4f46e5',
  RESOLVED: '#059669',
  CLOSED: '#6b7280',
  COMMENT_ADDED: '#7c3aed',
};

export default function RecentActivityWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const { data, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load data');
      return res.json() as Promise<DashboardStats>;
    },
    staleTime: 60_000,
  });

  const title = config.title || 'Recent Activity';

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
      ) : !data?.recentActivity?.length ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-placeholder)', fontSize: 14 }}>
          No recent activity
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.recentActivity.map((act) => {
            const typeLabel = act.activityType.replace(/_/g, ' ').toLowerCase();
            const badgeColor = ACTIVITY_COLORS[act.activityType] || 'var(--text-muted)';
            return (
              <div key={act.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon path={mdiClockOutline} size={0.6} color="var(--border-secondary)" style={{ flexShrink: 0, marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: badgeColor,
                      backgroundColor: badgeColor + '18',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}>
                      {typeLabel}
                    </span>
                    {act.fieldName && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({act.fieldName})</span>
                    )}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-placeholder)' }}>
                    {timeAgo(act.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetWrapper>
  );
}
