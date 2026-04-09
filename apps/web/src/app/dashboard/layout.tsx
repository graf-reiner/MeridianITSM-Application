'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Icon from '@mdi/react';
import ThemeProvider from '@/components/ThemeProvider';
import ThemeToggle from '@/components/ThemeToggle';
import ErrorBoundary from '@/components/ErrorBoundary';
import MobileLauncherModal from '@/components/MobileLauncherModal';
import { clearDevicePreference } from '@/lib/device-preference';
import {
  mdiViewDashboard,
  mdiTicketOutline,
  mdiBookOpenVariant,
  mdiChartBar,
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
  mdiShieldLock,
  mdiCellphone,
  mdiRobotOutline,
  mdiCheckDecagram,
  mdiAlertDecagramOutline,
} from '@mdi/js';
import AiChatPanel from '@/components/AiChatPanel';
import UpgradeModal from '@/components/UpgradeModal';
import TrialBanner from '@/components/TrialBanner';
import NotificationDropdown from '@/components/NotificationDropdown';
import GlobalSearch from '@/components/GlobalSearch';
import { usePlan } from '@/hooks/usePlan';

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
  { href: '/dashboard/problems', label: 'Problems', icon: mdiAlertDecagramOutline },
  { href: '/dashboard/approvals', label: 'Approvals', icon: mdiCheckDecagram },
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
        backgroundColor: isActive ? '#e0f2fe' : 'transparent',
        color: isActive ? 'var(--accent-brand)' : 'var(--text-secondary)',
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { plan, hasFeature, isActive, isLoading: planLoading } = usePlan();

  // Redirect suspended/canceled tenants to paywall
  useEffect(() => {
    if (!planLoading && plan && !isActive()) {
      router.push('/suspended');
    }
  }, [planLoading, plan, isActive, router]);

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
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-secondary)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Desktop Sidebar ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 240,
          backgroundColor: 'var(--bg-primary)',
          borderRight: '1px solid var(--border-primary)',
          flexShrink: 0,
        }}
        className="dashboard-sidebar-desktop"
      >
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ marginBottom: 24, padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/images/meridian-logo.svg" alt="" width={28} height={28} />
            <div>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#0284c7' }}>Meridian ITSM</span>
              <p style={{ margin: '1px 0 0', fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>Staff Dashboard</p>
            </div>
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

      {/* ── Mobile Sidebar Overlay + Drawer ─────────────────────────────────── */}
      {sidebarOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--shadow-md)',
              zIndex: 30,
            }}
            onClick={() => setSidebarOpen(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 260,
              backgroundColor: 'var(--bg-primary)',
              zIndex: 31,
              boxShadow: '4px 0 12px var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/images/meridian-logo.svg" alt="" width={28} height={28} />
                <div>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#0284c7' }}>Meridian ITSM</span>
                  <p style={{ margin: '1px 0 0', fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>Staff Dashboard</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
                aria-label="Close menu"
              >
                <Icon path={mdiClose} size={1} color="currentColor" />
              </button>
            </div>
            <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
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
        </>
      )}

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Top Header ────────────────────────────────────────────────────── */}
        <header
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border-primary)',
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
              color: 'var(--text-secondary)',
            }}
            className="dashboard-menu-button"
            aria-label="Toggle menu"
          >
            <Icon path={sidebarOpen ? mdiClose : mdiMenu} size={1} color="currentColor" />
          </button>

          <div style={{ flex: 1 }} />

          {/* Notification bell + dropdown */}
          <NotificationDropdown />

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
                color: 'var(--text-secondary)',
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
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 8,
                    boxShadow: '0 4px 6px -1px var(--shadow-sm)',
                    minWidth: 180,
                    zIndex: 20,
                    overflow: 'hidden',
                  }}
                >
                  <ThemeToggle />
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setUserMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Icon path={mdiAccountCircle} size={0.8} color="var(--text-muted)" />
                    My Profile
                  </Link>
                  <Link
                    href="/dashboard/settings/security"
                    onClick={() => setUserMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      textAlign: 'left',
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <Icon path={mdiShieldLock} size={0.8} color="var(--text-muted)" />
                    Security &amp; MFA
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      clearDevicePreference();
                      window.location.reload();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 14,
                      color: 'var(--text-secondary)',
                    }}
                    data-testid="user-menu-switch-to-mobile"
                  >
                    <Icon path={mdiCellphone} size={0.8} color="var(--text-muted)" />
                    Switch to mobile app
                  </button>
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
                      color: 'var(--accent-danger)',
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

        {/* ── Trial Banner ──────────────────────────────────────────────────── */}
        <TrialBanner />

        {/* ── Page Content ──────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-sidebar-desktop { display: none !important; }
          .dashboard-menu-button { display: flex !important; }
        }
      `}</style>
      <MobileLauncherModal />

      {/* AI Assistant FAB + Panel */}
      {hasFeature('ai_assistant') && (
        <>
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              title="AI Assistant"
              style={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                width: 52,
                height: 52,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'var(--accent-brand)',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 30,
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.2)';
              }}
            >
              <Icon path={mdiRobotOutline} size={1.15} color="#fff" />
            </button>
          )}
          <AiChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
        </>
      )}
      <UpgradeModal />
      <GlobalSearch />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <DashboardInner>{children}</DashboardInner>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
