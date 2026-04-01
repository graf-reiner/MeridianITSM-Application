'use client';

import { useState, useEffect } from 'react';

interface SsoConnection {
  id: string;
  name: string;
  protocol: string;
}

interface SsoDiscoveryResponse {
  connections: SsoConnection[];
  tenantId?: string;
  allowLocalAuth: boolean;
  enforceSso: boolean;
}

/**
 * Renders SSO sign-in buttons for a given tenant.
 * Fetches active SSO connections from the discovery endpoint
 * and displays a button for each one.
 *
 * Usage:
 *   <SsoButtons tenantSlug="acme" />
 *
 * This component is designed to be placed below the standard
 * login form. It renders nothing if no SSO connections exist.
 */
export function SsoButtons({ tenantSlug }: { tenantSlug: string }) {
  const [connections, setConnections] = useState<SsoConnection[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      return;
    }

    fetch(
      `/api/auth/sso/discover?tenantSlug=${encodeURIComponent(tenantSlug)}`,
    )
      .then((r) => r.json())
      .then((data: SsoDiscoveryResponse) => {
        setConnections(data.connections ?? []);
        setTenantId(data.tenantId ?? '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tenantSlug]);

  if (loading || connections.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
          color: 'var(--text-placeholder)',
          fontSize: 13,
        }}
      >
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-primary)' }} />
        <span>or sign in with</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-primary)' }} />
      </div>
      {connections.map((conn) => (
        <a
          key={conn.id}
          href={
            conn.protocol === 'saml'
              ? `/api/auth/sso/saml/authorize?tenant=${encodeURIComponent(tenantId)}&state=${btoa(JSON.stringify({ callbackUrl: '/dashboard/tickets', tenantId }))}`
              : `/api/auth/sso/oidc/${conn.id}?callbackUrl=/dashboard/tickets`
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '10px 16px',
            marginBottom: 8,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          {conn.name}
        </a>
      ))}
    </div>
  );
}
