'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiAlertCircleOutline } from '@mdi/js';
import { formatTicketNumber } from '@meridian/core/record-numbers';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  priority: string;
  status: string;
}

interface TicketResponse {
  data: Ticket[];
  total: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#6b7280',
};

export default function UnassignedTicketsWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const { data, isLoading, error } = useQuery<TicketResponse>({
    queryKey: ['unassigned-tickets-widget'],
    queryFn: async () => {
      const res = await fetch('/api/v1/tickets?unassigned=true&pageSize=10', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tickets');
      return res.json() as Promise<TicketResponse>;
    },
    staleTime: 30_000,
  });

  const title = config.title || 'Unassigned Tickets';
  const tickets = data?.data || [];
  const total = data?.total || 0;

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
      ) : tickets.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-placeholder)', fontSize: 14 }}>
          All tickets are assigned
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Count badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Icon path={mdiAlertCircleOutline} size={0.65} color="#d97706" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>
              {total} unassigned
            </span>
          </div>
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/tickets/${t.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 4px',
                textDecoration: 'none',
                borderRadius: 6,
                color: 'inherit',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0, width: 60 }}>
                {formatTicketNumber(t.ticketNumber)}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: PRIORITY_COLORS[t.priority] || '#6b7280',
                flexShrink: 0,
              }} title={t.priority} />
            </Link>
          ))}
        </div>
      )}
    </WidgetWrapper>
  );
}
