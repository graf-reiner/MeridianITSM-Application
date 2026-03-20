'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '◉' },
  { href: '/tenants', label: 'Tenants', icon: '⊞' },
  { href: '/billing', label: 'Billing', icon: '₿' },
  { href: '/plans', label: 'Plans', icon: '★' },
  { href: '/system', label: 'System', icon: '⚙' },
  { href: '/audit', label: 'Audit Log', icon: '≡' },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '220px',
        minHeight: '100vh',
        backgroundColor: '#1e1b4b',
        color: '#e0e7ff',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 0',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '0 20px 24px',
          borderBottom: '1px solid #312e81',
          marginBottom: '16px',
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '0.05em', color: '#a5b4fc' }}>
          MERIDIAN OWNER
        </span>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: isActive ? '600' : '400',
                color: isActive ? '#fff' : '#c7d2fe',
                backgroundColor: isActive ? '#4338ca' : 'transparent',
                transition: 'background-color 0.15s',
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
