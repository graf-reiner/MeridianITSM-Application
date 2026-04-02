'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiAccountGroup,
  mdiAccountMultiple,
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
  mdiShieldLock,
  mdiShieldKey,
  mdiShieldLockOutline,
  mdiBellAlert,
  mdiMicrosoftTeams,
  mdiSlack,
  mdiCellphone,
  mdiSend,
  mdiRobot,
} from '@mdi/js';

// ─── Settings Hub ─────────────────────────────────────────────────────────────

interface SettingsItem {
  href: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

interface SettingsGroup {
  title: string;
  items: SettingsItem[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: 'General',
    items: [
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
        href: '/dashboard/settings/groups',
        label: 'Groups',
        description: 'Organize users into teams and assign to queues',
        icon: mdiAccountMultiple,
        color: '#059669',
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
        href: '/dashboard/settings/tags',
        label: 'Tags',
        description: 'Manage tags for tickets and knowledge articles',
        icon: mdiTagMultiple,
        color: '#8b5cf6',
      },
    ],
  },
  {
    title: 'Notifications',
    items: [
      {
        href: '/dashboard/settings/email',
        label: 'Email Accounts',
        description: 'Configure inbound and outbound email',
        icon: mdiEmail,
        color: '#dc2626',
      },
      {
        href: '/dashboard/settings/notification-rules',
        label: 'Notification Rules',
        description: 'Configure when and how notifications are sent',
        icon: mdiBellAlert,
        color: '#d97706',
      },
      {
        href: '/dashboard/settings/alerts',
        label: 'Alert Channels',
        description: 'Send alerts to Slack, Teams, or email',
        icon: mdiBellRing,
        color: '#d97706',
      },
      {
        href: '/dashboard/settings/teams',
        label: 'Microsoft Teams',
        description: 'Send ticket notifications to Teams channels',
        icon: mdiMicrosoftTeams,
        color: '#5059c9',
      },
      {
        href: '/dashboard/settings/slack',
        label: 'Slack',
        description: 'Send ticket notifications to Slack channels',
        icon: mdiSlack,
        color: '#4a154b',
      },
      {
        href: '/dashboard/settings/sms',
        label: 'SMS',
        description: 'Send SMS notifications via Twilio or other providers',
        icon: mdiCellphone,
        color: '#0891b2',
      },
      {
        href: '/dashboard/settings/telegram',
        label: 'Telegram',
        description: 'Send notifications to Telegram chats and groups',
        icon: mdiSend,
        color: '#0088cc',
      },
      {
        href: '/dashboard/settings/discord',
        label: 'Discord',
        description: 'Send notifications to Discord channels via webhooks',
        icon: mdiRobot,
        color: '#5865f2',
      },
    ],
  },
  {
    title: 'Integrations',
    items: [
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
    ],
  },
  {
    title: 'Security',
    items: [
      {
        href: '/dashboard/settings/security',
        label: 'Security',
        description: 'Manage two-factor authentication and recovery codes',
        icon: mdiShieldLock,
        color: '#dc2626',
      },
      {
        href: '/dashboard/settings/sso',
        label: 'SSO Configuration',
        description: 'Configure OIDC and SAML identity providers',
        icon: mdiShieldKey,
        color: '#0891b2',
      },
      {
        href: '/dashboard/settings/auth-policy',
        label: 'Auth Policy',
        description: 'MFA, password, and session policies',
        icon: mdiShieldLockOutline,
        color: '#7c3aed',
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Settings</h1>
      <p style={{ margin: '0 0 32px', color: 'var(--text-muted)', fontSize: 14 }}>
        Configure your ITSM workspace settings.
      </p>

      {SETTINGS_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 32 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {group.title}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {group.items.map((section) => (
              <Link
                key={section.href}
                href={section.href}
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
                <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{section.label}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{section.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
