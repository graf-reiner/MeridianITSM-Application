'use client';

import { useState, useEffect, useCallback } from 'react';
import { ownerFetch } from '../../../lib/api';
import IntegrationCard from '../../../components/IntegrationCard';
import MicrosoftOAuthWizard from '../../../components/MicrosoftOAuthWizard';
import GoogleOAuthWizard from '../../../components/GoogleOAuthWizard';

export interface IntegrationStatus {
  provider: 'MICROSOFT' | 'GOOGLE';
  source: 'db' | 'env' | null;
  configured: boolean;
  clientIdMasked: string | null;
  secretExpiresAt: string | null;
  notes: string | null;
  updatedAt: string | null;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [redirectUri, setRedirectUri] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWizard, setActiveWizard] = useState<'MICROSOFT' | 'GOOGLE' | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ownerFetch('/api/integrations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { integrations: IntegrationStatus[]; redirectUri: string };
      setIntegrations(data.integrations);
      setRedirectUri(data.redirectUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIntegrations();
  }, [fetchIntegrations]);

  const microsoft = integrations.find(i => i.provider === 'MICROSOFT');
  const google = integrations.find(i => i.provider === 'GOOGLE');

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: '#1e293b' }}>
        Integrations
      </h1>
      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
        Configure platform-wide OAuth applications used by every tenant when they connect their email.
        Set this once per environment — every customer benefits.
      </p>

      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {microsoft && (
            <IntegrationCard
              status={microsoft}
              onConfigure={() => setActiveWizard('MICROSOFT')}
              onChanged={fetchIntegrations}
            />
          )}
          {google && (
            <IntegrationCard
              status={google}
              onConfigure={() => setActiveWizard('GOOGLE')}
              onChanged={fetchIntegrations}
            />
          )}
        </div>
      )}

      {activeWizard === 'MICROSOFT' && (
        <MicrosoftOAuthWizard
          redirectUri={redirectUri}
          existing={microsoft ?? null}
          onClose={() => { setActiveWizard(null); void fetchIntegrations(); }}
        />
      )}
      {activeWizard === 'GOOGLE' && (
        <GoogleOAuthWizard
          redirectUri={redirectUri}
          existing={google ?? null}
          onClose={() => { setActiveWizard(null); void fetchIntegrations(); }}
        />
      )}
    </div>
  );
}
