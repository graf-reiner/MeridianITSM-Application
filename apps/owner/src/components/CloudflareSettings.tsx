'use client';

import { useState, useEffect, useCallback } from 'react';
import { ownerFetch } from '../lib/api';

interface CloudflareConfigStatus {
  configured: boolean;
  accountId: string | null;
  tunnelId: string | null;
  tunnelCname: string | null;
  defaultOrigin: string;
  isEnabled: boolean;
  lastVerifiedAt: string | null;
  apiTokenMasked: string | null;
  updatedAt: string | null;
}

interface CloudflareDomainRow {
  id: string;
  apex: string;
  zoneId: string;
  isDefault: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const SECRET_MASK = '********';

export default function CloudflareSettings() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CloudflareConfigStatus | null>(null);

  const [accountId, setAccountId] = useState('');
  const [tunnelId, setTunnelId] = useState('');
  const [tunnelCname, setTunnelCname] = useState('');
  const [defaultOrigin, setDefaultOrigin] = useState('http://localhost:3000');
  const [apiToken, setApiToken] = useState('');

  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Domains
  const [domains, setDomains] = useState<CloudflareDomainRow[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newApex, setNewApex] = useState('');
  const [newZoneId, setNewZoneId] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [detectingZone, setDetectingZone] = useState(false);
  const [domainStatus, setDomainStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await ownerFetch('/api/cloudflare/config');
      if (res.ok) {
        const data = (await res.json()) as { config: CloudflareConfigStatus };
        setConfig(data.config);
        if (data.config.configured) {
          setAccountId(data.config.accountId ?? '');
          setTunnelId(data.config.tunnelId ?? '');
          setTunnelCname(data.config.tunnelCname ?? '');
          setDefaultOrigin(data.config.defaultOrigin);
          setApiToken(SECRET_MASK);
        }
      }
    } catch {
      // ignore — form stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const res = await ownerFetch('/api/cloudflare/domains');
      if (res.ok) {
        const data = (await res.json()) as { domains: CloudflareDomainRow[] };
        setDomains(data.domains);
      }
    } catch {
      // ignore
    } finally {
      setDomainsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadDomains();
  }, [loadConfig, loadDomains]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await ownerFetch('/api/cloudflare/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          tunnelId: tunnelId.trim(),
          tunnelCname: tunnelCname.trim(),
          defaultOrigin: defaultOrigin.trim(),
          apiToken,
          isEnabled: true,
        }),
      });
      const data = (await res.json()) as { config?: CloudflareConfigStatus; error?: string };
      if (res.ok && data.config) {
        setConfig(data.config);
        setApiToken(SECRET_MASK);
        setSaveStatus({ type: 'success', message: 'Cloudflare configuration saved.' });
      } else {
        setSaveStatus({ type: 'error', message: data.error ?? 'Failed to save configuration.' });
      }
    } catch {
      setSaveStatus({ type: 'error', message: 'Network error. Could not save configuration.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setVerifyStatus(null);
    try {
      const res = await ownerFetch('/api/cloudflare/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiToken,
          accountId: accountId.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; tokenId?: string; status?: string; error?: string };
      if (res.ok && data.ok) {
        setVerifyStatus({
          type: 'success',
          message: `Token active (${data.tokenId?.slice(0, 8) ?? 'verified'}…)`,
        });
        await loadConfig();
      } else {
        setVerifyStatus({ type: 'error', message: data.error ?? 'Verification failed.' });
      }
    } catch {
      setVerifyStatus({ type: 'error', message: 'Network error. Could not verify token.' });
    } finally {
      setVerifying(false);
    }
  }

  async function handleDetectZone() {
    if (!newApex.trim()) return;
    setDetectingZone(true);
    setDomainStatus(null);
    try {
      const res = await ownerFetch('/api/cloudflare/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apex: newApex.trim().toLowerCase() }),
      });
      const data = (await res.json()) as { zoneId?: string; error?: string };
      if (res.ok && data.zoneId) {
        setNewZoneId(data.zoneId);
        setDomainStatus({ type: 'success', message: `Zone detected: ${data.zoneId}` });
      } else {
        setDomainStatus({ type: 'error', message: data.error ?? 'Zone lookup failed.' });
      }
    } catch {
      setDomainStatus({ type: 'error', message: 'Network error. Could not look up zone.' });
    } finally {
      setDetectingZone(false);
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    setDomainStatus(null);
    try {
      const res = await ownerFetch('/api/cloudflare/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apex: newApex.trim().toLowerCase(), zoneId: newZoneId.trim(), isDefault: newIsDefault }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setNewApex('');
        setNewZoneId('');
        setNewIsDefault(false);
        setShowAddDomain(false);
        await loadDomains();
        setDomainStatus({ type: 'success', message: 'Domain added.' });
      } else {
        setDomainStatus({ type: 'error', message: data.error ?? 'Failed to add domain.' });
      }
    } catch {
      setDomainStatus({ type: 'error', message: 'Network error.' });
    }
  }

  async function handleMakeDefault(id: string) {
    try {
      const res = await ownerFetch(`/api/cloudflare/domains/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) await loadDomains();
    } catch {
      // ignore
    }
  }

  async function handleDeleteDomain(id: string) {
    if (!confirm('Delete this Cloudflare domain? Tenants currently bound to it will block the delete.')) return;
    try {
      const res = await ownerFetch(`/api/cloudflare/domains/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { error?: string; tenants?: Array<{ slug: string; name: string }> };
      if (res.ok) {
        await loadDomains();
        setDomainStatus({ type: 'success', message: 'Domain removed.' });
      } else {
        const tenantList = data.tenants?.map((t) => t.slug).join(', ') ?? '';
        setDomainStatus({
          type: 'error',
          message: data.error ?? `Cannot delete: in use by ${tenantList}`,
        });
      }
    } catch {
      setDomainStatus({ type: 'error', message: 'Network error.' });
    }
  }

  // ── styles (mirrors SmtpSettings) ──────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#111827',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '4px',
  };
  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
  };
  const primaryButtonStyle: React.CSSProperties = {
    backgroundColor: saving ? '#818cf8' : '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: saving ? 'not-allowed' : 'pointer',
  };
  const secondaryButtonStyle: React.CSSProperties = {
    backgroundColor: verifying ? '#d1d5db' : '#6b7280',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: verifying ? 'not-allowed' : 'pointer',
  };

  if (loading) {
    return <div style={{ color: '#6b7280', fontSize: '14px', padding: '16px 0' }}>Loading Cloudflare configuration...</div>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
        Cloudflare Integration
      </h2>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Stores credentials for the Cloudflare Tunnel and the apex domains tenants are provisioned on. When a new tenant
        is created with a Subdomain + Domain, a tunnel ingress entry and a proxied DNS CNAME are created automatically.
      </p>

      {/* Section 1: Credentials */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginTop: 0, marginBottom: '20px' }}>
          API Credentials
        </h3>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>API Token</label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste your Cloudflare API token"
              required
              style={inputStyle}
              autoComplete="new-password"
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
              Required permissions: <code>Account.Cloudflare Tunnel:Edit</code> and <code>Zone.DNS:Edit</code>. Generate
              at dash.cloudflare.com → My Profile → API Tokens.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Account ID</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="e.g. 2228560921f42964604c438d5129e6c0"
                required
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Tunnel ID</label>
              <input
                type="text"
                value={tunnelId}
                onChange={(e) => {
                  setTunnelId(e.target.value);
                  if (!tunnelCname.trim() && e.target.value.trim()) {
                    setTunnelCname(`${e.target.value.trim()}.cfargotunnel.com`);
                  }
                }}
                placeholder="e.g. e9f269c1-46de-4388-ad87-619cf2734c90"
                required
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Tunnel CNAME target</label>
              <input
                type="text"
                value={tunnelCname}
                onChange={(e) => setTunnelCname(e.target.value)}
                placeholder="<tunnelId>.cfargotunnel.com"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Default Origin URL</label>
              <input
                type="text"
                value={defaultOrigin}
                onChange={(e) => setDefaultOrigin(e.target.value)}
                placeholder="http://10.1.200.218:3000"
                style={inputStyle}
              />
            </div>
          </div>

          {saveStatus && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                backgroundColor: saveStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: saveStatus.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${saveStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              {saveStatus.message}
            </div>
          )}
          {verifyStatus && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                backgroundColor: verifyStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: verifyStatus.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${verifyStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              {verifyStatus.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={saving} style={primaryButtonStyle}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={verifying || !accountId.trim() || !apiToken}
              style={{ ...secondaryButtonStyle, opacity: verifying || !accountId.trim() ? 0.6 : 1 }}
            >
              {verifying ? 'Verifying...' : 'Test connection'}
            </button>
            {config?.lastVerifiedAt && (
              <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
                Last verified {new Date(config.lastVerifiedAt).toLocaleString()}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Section 2: Domains */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>Apex Domains</h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
              Domains tenants can be provisioned on. The default is preselected on the Provision New Tenant form.
            </p>
          </div>
          <button
            type="button"
            disabled={!config?.configured}
            onClick={() => {
              setShowAddDomain((v) => !v);
              setDomainStatus(null);
            }}
            style={{
              backgroundColor: config?.configured ? '#4f46e5' : '#9ca3af',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              cursor: config?.configured ? 'pointer' : 'not-allowed',
            }}
          >
            {showAddDomain ? 'Cancel' : '+ Add domain'}
          </button>
        </div>

        {!config?.configured && (
          <div style={{ padding: '12px 16px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
            Save Cloudflare credentials and verify the connection before adding domains.
          </div>
        )}

        {showAddDomain && (
          <form
            onSubmit={(e) => void handleAddDomain(e)}
            style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 16, marginBottom: 16 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '2fr auto', gap: 12, alignItems: 'end', marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Apex domain</label>
                <input
                  type="text"
                  value={newApex}
                  onChange={(e) => setNewApex(e.target.value.toLowerCase())}
                  placeholder="meridianitsm.com"
                  required
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                />
              </div>
              <button
                type="button"
                onClick={() => void handleDetectZone()}
                disabled={detectingZone || !newApex.trim()}
                style={{
                  backgroundColor: detectingZone ? '#d1d5db' : '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: detectingZone || !newApex.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {detectingZone ? 'Detecting...' : 'Detect zone'}
              </button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Zone ID</label>
              <input
                type="text"
                value={newZoneId}
                onChange={(e) => setNewZoneId(e.target.value)}
                placeholder="auto-detected, or paste manually"
                required
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginBottom: 12 }}>
              <input type="checkbox" checked={newIsDefault} onChange={(e) => setNewIsDefault(e.target.checked)} />
              Set as default for new tenants
            </label>

            <button
              type="submit"
              disabled={!newApex.trim() || !newZoneId.trim()}
              style={{
                backgroundColor: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: !newApex.trim() || !newZoneId.trim() ? 'not-allowed' : 'pointer',
                opacity: !newApex.trim() || !newZoneId.trim() ? 0.6 : 1,
              }}
            >
              Add domain
            </button>
          </form>
        )}

        {domainStatus && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              backgroundColor: domainStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: domainStatus.type === 'success' ? '#166534' : '#991b1b',
              border: `1px solid ${domainStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {domainStatus.message}
          </div>
        )}

        {domainsLoading ? (
          <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading...</div>
        ) : domains.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>No domains configured yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>APEX</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>ZONE ID</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>DEFAULT</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', color: '#111827', fontFamily: 'monospace' }}>{d.apex}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{d.zoneId}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {d.isDefault ? (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: '#ede9fe',
                          color: '#5b21b6',
                        }}
                      >
                        DEFAULT
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {!d.isDefault && (
                      <button
                        onClick={() => void handleMakeDefault(d.id)}
                        style={{
                          background: 'transparent',
                          color: '#4f46e5',
                          border: '1px solid #c7d2fe',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontSize: 12,
                          cursor: 'pointer',
                          marginRight: 6,
                        }}
                      >
                        Make default
                      </button>
                    )}
                    <button
                      onClick={() => void handleDeleteDomain(d.id)}
                      style={{
                        background: 'transparent',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
