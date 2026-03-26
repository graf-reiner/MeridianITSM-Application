'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiAccountGroup,
  mdiShieldAccount,
  mdiTrayFull,
  mdiTag,
  mdiClockAlert,
  mdiEmail,
  mdiDesktopClassic,
  mdiKeyVariant,
  mdiWebhook,
  mdiBellRing,
  mdiTagMultiple,
} from '@mdi/js';

// ─── Settings Hub ─────────────────────────────────────────────────────────────

const SETTINGS_SECTIONS = [
  {
    href: '/dashboard/settings/users',
    label: 'Users',
    description: 'Manage staff accounts, roles, and access',
    icon: mdiAccountGroup,
    color: '#4f46e5',
  },
  {
    href: '/dashboard/settings/roles',
    label: 'Roles',
    description: 'Create custom roles with permission sets',
    icon: mdiShieldAccount,
    color: '#7c3aed',
  },
  {
    href: '/dashboard/settings/queues',
    label: 'Queues',
    description: 'Configure ticket queues and auto-assignment',
    icon: mdiTrayFull,
    color: '#0891b2',
  },
  {
    href: '/dashboard/settings/categories',
    label: 'Categories',
    description: 'Manage hierarchical ticket categories',
    icon: mdiTag,
    color: '#059669',
  },
  {
    href: '/dashboard/settings/sla',
    label: 'SLA Policies',
    description: 'Define response and resolution SLA targets',
    icon: mdiClockAlert,
    color: '#d97706',
  },
  {
    href: '/dashboard/settings/email',
    label: 'Email Accounts',
    description: 'Configure inbound and outbound email',
    icon: mdiEmail,
    color: '#dc2626',
  },
  {
    href: '/dashboard/settings/agents',
    label: 'Agents',
    description: 'Manage enrolled inventory agents and enrollment tokens',
    icon: mdiDesktopClassic,
    color: '#0891b2',
  },
  {
    href: '/dashboard/settings/api-keys',
    label: 'API Keys',
    description: 'Create API keys for external integrations',
    icon: mdiKeyVariant,
    color: '#7c3aed',
  },
  {
    href: '/dashboard/settings/webhooks',
    label: 'Webhooks',
    description: 'Receive real-time event notifications via webhooks',
    icon: mdiWebhook,
    color: '#059669',
  },
  {
    href: '/dashboard/settings/alerts',
    label: 'Alert Channels',
    description: 'Send alerts to Slack, Teams, or email',
    icon: mdiBellRing,
    color: '#d97706',
  },
  {
    href: '/dashboard/settings/tags',
    label: 'Tags',
    description: 'Manage tags for tickets and knowledge articles',
    icon: mdiTagMultiple,
    color: '#8b5cf6',
  },
];

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#111827' }}>Settings</h1>
      <p style={{ margin: '0 0 32px', color: '#6b7280', fontSize: 14 }}>
        Configure your ITSM workspace settings.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {SETTINGS_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            style={{
              display: 'block',
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 20,
              textDecoration: 'none',
              color: 'inherit',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: section.color + '1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Icon path={section.icon} size={1.1} color={section.color} />
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#111827' }}>{section.label}</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
