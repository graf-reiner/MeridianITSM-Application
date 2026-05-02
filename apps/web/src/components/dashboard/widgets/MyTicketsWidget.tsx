'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
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

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'rgba(220,38,38,0.12)', text: '#dc2626' },
  HIGH: { bg: 'rgba(234,88,12,0.12)', text: '#ea580c' },
  MEDIUM: { bg: 'rgba(202,138,4,0.12)', text: '#ca8a04' },
  LOW: { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: 'rgba(79,70,229,0.12)', text: '#4f46e5' },
  OPEN: { bg: 'rgba(8,145,178,0.12)', text: '#0891b2' },
  IN_PROGRESS: { bg: 'rgba(217,119,6,0.12)', text: '#d97706' },
  RESOLVED: { bg: 'rgba(5,150,105,0.12)', text: '#059669' },
  CLOSED: { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
};

function Badge({ label, colorSet }: { label: string; colorSet: { bg: string; text: string } }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: 4,
      backgroundColor: colorSet.bg,
      color: colorSet.text,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      whiteSpace: 'nowrap',
    }}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

export default function MyTicketsWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const { data, isLoading, error } = useQuery<TicketResponse>({
    queryKey: ['my-tickets-widget'],
    queryFn: async () => {
      const res = await fetch('/api/v1/tickets?assignedToMe=true&pageSize=10&status=NEW,OPEN,IN_PROGRESS', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tickets');
      return res.json() as Promise<TicketResponse>;
    },
    staleTime: 30_000,
  });

  const title = config.title || 'My Tickets';
  const tickets = data?.data || [];

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
          No tickets assigned to you
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/tickets/${t.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 4px',
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
              <Badge label={t.priority} colorSet={PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.LOW} />
              <Badge label={t.status} colorSet={STATUS_COLORS[t.status] || STATUS_COLORS.OPEN} />
            </Link>
          ))}
        </div>
      )}
    </WidgetWrapper>
  );
}
