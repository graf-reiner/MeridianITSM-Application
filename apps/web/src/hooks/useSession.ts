'use client';

import { useMemo } from 'react';

interface SessionPayload {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
}

/**
 * Decode the meridian_session JWT cookie on the client to extract user info.
 * No verification — just base64 payload decode for UI-level role checks.
 * Security enforcement happens server-side in the API.
 */
function decodeJwtPayload(): SessionPayload | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)meridian_session=([^;]*)/);
  if (!match) return null;

  try {
    const token = decodeURIComponent(match[1]);
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1])) as Record<string, unknown>;
    return {
      userId: (payload.userId as string) ?? '',
      tenantId: (payload.tenantId as string) ?? '',
      email: (payload.email as string) ?? '',
      roles: (payload.roles as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Hook to access the current user's session from the JWT cookie.
 * Returns { userId, tenantId, email, roles, isAdmin }.
 */
export function useSession() {
  const session = useMemo(() => decodeJwtPayload(), []);

  const isAdmin = useMemo(() => {
    if (!session) return false;
    return session.roles.some((r) => r === 'admin' || r === 'msp_admin');
  }, [session]);

  return {
    session,
    isAdmin,
    roles: session?.roles ?? [],
    userId: session?.userId ?? null,
    tenantId: session?.tenantId ?? null,
    email: session?.email ?? null,
  };
}
