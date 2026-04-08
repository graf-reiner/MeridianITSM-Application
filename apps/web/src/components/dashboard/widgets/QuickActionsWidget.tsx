'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiPlus, mdiSwapHorizontal, mdiBookOpenVariant } from '@mdi/js';
import WidgetWrapper from '../WidgetWrapper';
import type { WidgetProps } from '../types';

const ACTIONS = [
  { href: '/dashboard/tickets/new', label: 'New Ticket', icon: mdiPlus, color: '#059669' },
  { href: '/dashboard/changes/new', label: 'New Change', icon: mdiSwapHorizontal, color: '#4f46e5' },
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: mdiBookOpenVariant, color: '#d97706' },
];

export default function QuickActionsWidget({ widgetId, config, isEditing, onConfigChange }: WidgetProps) {
  const title = config.title || 'Quick Actions';

  return (
    <WidgetWrapper title={title} isEditing={isEditing} onRemove={isEditing ? () => onConfigChange?.(widgetId, { ...config, type: '__remove__' }) : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, height: '100%', alignContent: 'center' }}>
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '10px 4px',
              borderRadius: 8,
              textDecoration: 'none',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              transition: 'border-color 0.15s, background-color 0.15s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = action.color;
              e.currentTarget.style.backgroundColor = action.color + '0a';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-primary)';
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: action.color + '18',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon path={action.icon} size={0.8} color={action.color} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, textAlign: 'center' }}>{action.label}</span>
          </Link>
        ))}
      </div>
    </WidgetWrapper>
  );
}
