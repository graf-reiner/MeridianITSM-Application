'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiCog,
  mdiShapeOutline,
  mdiListStatus,
  mdiEarth,
  mdiRelationManyToMany,
  mdiDomain,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsCard {
  href: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

const CMDB_SETTINGS: SettingsCard[] = [
  {
    href: '/dashboard/cmdb/settings/classes',
    label: 'CI Classes',
    description: 'Define configuration item types and their hierarchy',
    icon: mdiShapeOutline,
    color: '#4f46e5',
  },
  {
    href: '/dashboard/cmdb/settings/statuses',
    label: 'Statuses',
    description: 'Manage lifecycle and operational status values',
    icon: mdiListStatus,
    color: '#059669',
  },
  {
    href: '/dashboard/cmdb/settings/environments',
    label: 'Environments',
    description: 'Configure deployment environments (production, staging, etc.)',
    icon: mdiEarth,
    color: '#0891b2',
  },
  {
    href: '/dashboard/cmdb/settings/relationship-types',
    label: 'Relationship Types',
    description: 'Define how configuration items relate to each other',
    icon: mdiRelationManyToMany,
    color: '#7c3aed',
  },
  {
    href: '/dashboard/cmdb/settings/vendors',
    label: 'Vendors',
    description: 'Manage hardware, software, and service vendors',
    icon: mdiDomain,
    color: '#d97706',
  },
];

// ─── CMDB Settings Index ─────────────────────────────────────────────────────

export default function CMDBSettingsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/cmdb" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiCog} size={1} color="var(--accent-primary)" />
          CMDB Settings
        </h1>
      </div>

      <p style={{ margin: '0 0 28px', color: 'var(--text-muted)', fontSize: 14 }}>
        Manage reference data used across the Configuration Management Database.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {CMDB_SETTINGS.map((card) => (
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
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: card.color + '1a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Icon path={card.icon} size={1.1} color={card.color} />
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{card.label}</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
