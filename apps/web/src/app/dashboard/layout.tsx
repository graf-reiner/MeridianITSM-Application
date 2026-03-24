'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Icon from '@mdi/react';
import {
  mdiViewDashboard,
  mdiTicketOutline,
  mdiBookOpenVariant,
  mdiChartBar,
  mdiBell,
  mdiAccountCircle,
  mdiLogout,
  mdiCog,
  mdiMenu,
  mdiClose,
  mdiPackageVariantClosed,
  mdiServerNetwork,
  mdiSwapHorizontal,
  mdiAccountGroup,
  mdiApplicationBracketsOutline,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// ─── QueryClient ──────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// ─── Navigation Config ────────────────────────────────────────────────────────

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: mdiViewDashboard },
  { href: '/dashboard/tickets', label: 'Tickets', icon: mdiTicketOutline },
  { href: '/dashboard/assets', label: 'Assets', icon: mdiPackageVariantClosed },
  { href: '/dashboard/cmdb', label: 'CMDB', icon: mdiServerNetwork },
  { href: '/dashboard/changes', label: 'Changes', icon: mdiSwapHorizontal },
  { href: '/dashboard/cab', label: 'CAB Meetings', icon: mdiAccountGroup },
  { href: '/dashboard/applications', label: 'Applications', icon: mdiApplicationBracketsOutline },
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: mdiBookOpenVariant },
  { href: '/dashboard/reports', label: 'Reports', icon: mdiChartBar },
  { href: '/dashboard/settings', label: 'Settings', icon: mdiCog },
];

// ─── Nav Link ─────────────────────────────────────────────────────────────────

function NavLink({ item, isActive, onClick }: { item: NavItem; isActive: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderRadius: 8,
        textDecoration: 'none',
        fontSize: 14,
        fontWeight: isActive ? 600 : 400,
        backgroundColor: isActive ? '#e0e7ff' : 'transparent',
        color: isActive ? '#4f46e5' : '#374151',
        transition: 'background-color 0.15s ease, color 0.15s ease',
      }}
    >
      <Icon path={item.icon} size={0.9} color="currentColor" />
      {item.label}
    </Link>
  );
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

function DashboardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Fetch unread notification count
  useEffect(() => {
    async function fetchUnreadCount() {
      try {
        const res = await fetch('/api/v1/notifications?unread=true&count=true', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = (await res.json()) as { count: number };
          setUnreadCount(data.count ?? 0);
        }
      } catch {
        // Non-critical
      }
    }
    void fetchUnreadCount();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore
    }
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Desktop Sidebar ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 240,
          backgroundColor: '#fff',
          borderRight: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
        className="dashboard-sidebar-desktop"
      >
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ marginBottom: 24, padding: '4px 16px' }}>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#4f46e5' }}>MeridianITSM</span>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>Staff Dashboard</p>
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>
      </div>

      {/* ── Mobile Sidebar Overlay ────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            zIndex: 30,
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Top Header ────────────────────────────────────────────────────── */}
        <header
          style={{
            backgroundColor: '#fff',
            borderBottom: '1px solid #e5e7eb',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: '#374151',
            }}
            className="dashboard-menu-button"
            aria-label="Toggle menu"
          >
            <Icon path={sidebarOpen ? mdiClose : mdiMenu} size={1} color="currentColor" />
          </button>

          <div style={{ flex: 1 }} />

          {/* Notification bell */}
          <button
            style={{
              position: 'relative',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              color: '#374151',
              borderRadius: 6,
              marginRight: 8,
            }}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          >
            <Icon path={mdiBell} size={0.9} color="currentColor" />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 16,
                  height: 16,
                  fontSize: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User menu */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 6,
                color: '#374151',
                fontSize: 14,
              }}
              aria-label="User menu"
            >
              <Icon path={mdiAccountCircle} size={1} color="currentColor" />
            </button>

            {userMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 19 }}
                  onClick={() => setUserMenuOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    minWidth: 160,
                    zIndex: 20,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      void handleLogout();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 14,
                      color: '#dc2626',
                    }}
                  >
                    <Icon path={mdiLogout} size={0.8} color="currentColor" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* ── Page Content ──────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {children}
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-sidebar-desktop { display: none !important; }
          .dashboard-menu-button { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardInner>{children}</DashboardInner>
    </QueryClientProvider>
  );
}
