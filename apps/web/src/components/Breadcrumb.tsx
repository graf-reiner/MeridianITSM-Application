'use client';

import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiChevronRight, mdiHome } from '@mdi/js';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * Reusable breadcrumb navigation.
 * Usage: <Breadcrumb items={[{ label: 'Tickets', href: '/dashboard/tickets' }, { label: 'SR-00001' }]} />
 */
export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 13,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <Link
        href="/dashboard"
        style={{
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-muted)',
          textDecoration: 'none',
        }}
      >
        <Icon path={mdiHome} size={0.6} color="currentColor" />
      </Link>

      {items.map((item, idx) => (
        <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon path={mdiChevronRight} size={0.55} color="var(--text-placeholder)" />
          {item.href ? (
            <Link
              href={item.href}
              style={{
                color: 'var(--text-muted)',
                textDecoration: 'none',
                fontWeight: 400,
              }}
            >
              {item.label}
            </Link>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
