'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiTicketOutline, mdiBookOpenVariant, mdiChartBar, mdiCog, mdiPlus } from '@mdi/js';

export default function DashboardPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
        Staff Dashboard
      </h1>
      <p style={{ margin: '0 0 32px', color: 'var(--text-muted)', fontSize: 14 }}>
        Manage tickets, knowledge articles, and system settings.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { href: '/dashboard/tickets', label: 'Tickets', desc: 'Manage and resolve support tickets', icon: mdiTicketOutline, color: 'var(--accent-primary)' },
          { href: '/dashboard/tickets/new', label: 'New Ticket', desc: 'Create a new support ticket', icon: mdiPlus, color: 'var(--accent-success)' },
          { href: '/dashboard/knowledge', label: 'Knowledge Base', desc: 'Manage articles and documentation', icon: mdiBookOpenVariant, color: 'var(--accent-warning)' },
          { href: '/dashboard/reports', label: 'Reports', desc: 'View ticket metrics and analytics', icon: mdiChartBar, color: '#7c3aed' },
          { href: '/dashboard/settings', label: 'Settings', desc: 'Configure users, roles, and policies', icon: mdiCog, color: 'var(--text-secondary)' },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{
              display: 'block',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 12,
              padding: 20,
              textDecoration: 'none',
              color: 'inherit',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: card.color + '1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Icon path={card.icon} size={1} color={card.color} />
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{card.label}</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
