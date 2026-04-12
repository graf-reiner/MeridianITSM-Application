'use client';

import { usePathname, useRouter } from 'next/navigation';
import Icon from '@mdi/react';
import { mdiEye, mdiViewDashboard } from '@mdi/js';
import { useSession } from '@/hooks/useSession';

/**
 * Toggle between Dashboard (staff) and Portal (end-user) views.
 * Only rendered for staff users (admin, msp_admin, agent).
 * When on /dashboard/*, shows "Portal View" button.
 * When on /portal/*, shows "Dashboard" button.
 */
export default function ViewToggle() {
  const { roles } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isStaff = roles.some((r) => r === 'admin' || r === 'msp_admin' || r === 'agent');
  if (!isStaff) return null;

  const isPortal = pathname.startsWith('/portal');
  const targetPath = isPortal ? '/dashboard/tickets' : '/portal';
  const label = isPortal ? 'Dashboard' : 'Portal View';
  const icon = isPortal ? mdiViewDashboard : mdiEye;

  return (
    <button
      onClick={() => router.push(targetPath)}
      title={isPortal ? 'Switch to Staff Dashboard' : 'Preview Portal (end-user view)'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        marginRight: 6,
        backgroundColor: isPortal ? 'var(--accent-primary)' : 'var(--bg-secondary)',
        color: isPortal ? 'var(--bg-primary)' : 'var(--text-secondary)',
        border: isPortal ? 'none' : '1px solid var(--border-secondary)',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon path={icon} size={0.7} color="currentColor" />
      {label}
    </button>
  );
}
