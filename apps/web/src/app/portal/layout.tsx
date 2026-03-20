'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import {
  mdiHome,
  mdiTicketOutline,
  mdiPlus,
  mdiBookOpenVariant,
  mdiLaptop,
  mdiBell,
  mdiAccountCircle,
  mdiLogout,
  mdiMenu,
  mdiClose,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// ─── Navigation Config ────────────────────────────────────────────────────────

const navItems: NavItem[] = [
  { href: '/portal', label: 'Home', icon: mdiHome },
  { href: '/portal/tickets', label: 'My Tickets', icon: mdiTicketOutline },
  { href: '/portal/tickets/new', label: 'New Request', icon: mdiPlus },
  { href: '/portal/knowledge', label: 'Knowledge Base', icon: mdiBookOpenVariant },
  { href: '/portal/assets', label: 'My Assets', icon: mdiLaptop },
];

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────

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

// ─── Portal Layout ────────────────────────────────────────────────────────────

export default function PortalLayout({ children }: { children: React.ReactNode }) {
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
        // Non-critical — ignore errors
      }
    }
    void fetchUnreadCount();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore errors
    }
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/portal') return pathname === '/portal';
    return pathname.startsWith(href);
  };

  // ── Sidebar ──────────────────────────────────────────────────────────────

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav
      style={{
        width: mobile ? '100%' : 240,
        height: mobile ? 'auto' : '100%',
        backgroundColor: '#fff',
        borderRight: mobile ? 'none' : '1px solid #e5e7eb',
        borderTop: mobile ? '1px solid #e5e7eb' : 'none',
        display: 'flex',
        flexDirection: mobile ? 'row' : 'column',
        padding: mobile ? '8px' : '16px 12px',
        gap: mobile ? 0 : 4,
        overflowX: mobile ? 'auto' : 'visible',
        position: mobile ? 'fixed' : 'relative',
        bottom: mobile ? 0 : 'auto',
        left: mobile ? 0 : 'auto',
        right: mobile ? 0 : 'auto',
        zIndex: mobile ? 40 : 'auto',
        justifyContent: mobile ? 'space-around' : 'flex-start',
      }}
    >
      {!mobile && (
        <div style={{ marginBottom: 24, padding: '4px 16px' }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: '#4f46e5' }}>MeridianITSM</span>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>Self-Service Portal</p>
        </div>
      )}
      {navItems.map((item) =>
        mobile ? (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '6px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 10,
              fontWeight: isActive(item.href) ? 600 : 400,
              color: isActive(item.href) ? '#4f46e5' : '#6b7280',
              flex: 1,
            }}
          >
            <Icon path={item.icon} size={0.85} color="currentColor" />
            {item.label}
          </Link>
        ) : (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActive(item.href)}
            onClick={() => setSidebarOpen(false)}
          />
        )
      )}
    </nav>
  );

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
        className="portal-sidebar-desktop"
      >
        <Sidebar />
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

        {/* ── Top Header ──────────────────────────────────────────────────────── */}
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
          {/* Mobile menu button */}
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
            className="portal-menu-button"
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

          {/* User profile dropdown */}
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

        {/* ── Page Content ────────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px', paddingBottom: 80 }}>
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ────────────────────────────────────────────────── */}
      <div className="portal-bottom-nav" style={{ display: 'none' }}>
        <Sidebar mobile />
      </div>

      <style>{`
        @media (max-width: 768px) {
          .portal-sidebar-desktop { display: none !important; }
          .portal-menu-button { display: flex !important; }
          .portal-bottom-nav { display: block !important; }
        }
      `}</style>
    </div>
  );
}
