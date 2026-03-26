'use client';

import { useState, useEffect } from 'react';

interface SsoConnection {
  id: string;
  name: string;
  protocol: string;
}

interface SsoDiscoveryResponse {
  connections: SsoConnection[];
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
          color: '#94a3b8',
          fontSize: 13,
        }}
      >
        <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
        <span>or sign in with</span>
        <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
      </div>
      {connections.map((conn) => (
        <a
          key={conn.id}
          href={`/api/auth/sso/oidc/${conn.id}?callbackUrl=/dashboard/tickets`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '10px 16px',
            marginBottom: 8,
            background: '#fff',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
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
