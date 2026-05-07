'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const PLAN_TIERS = [
  { value: 'STARTER', label: 'Starter', desc: '5 users, basic features' },
  { value: 'PROFESSIONAL', label: 'Professional', desc: '25 users, SLA, API access' },
  { value: 'BUSINESS', label: 'Business', desc: '100 users, CMDB, mobile' },
  { value: 'ENTERPRISE', label: 'Enterprise', desc: 'Unlimited users, SSO, webhooks' },
];

interface CloudflareZone {
  id: string;
  name: string;
}

interface CloudflareConfigStatus {
  configured: boolean;
  defaultOrigin: string;
}

type CfRouteStatus = 'NONE' | 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'FAILED';

function splitOrigin(url: string | null | undefined): { type: 'http' | 'https'; hostport: string } {
  if (!url) return { type: 'http', hostport: '' };
  const trimmed = url.trim();
  const match = /^(https?):\/\/(.+)$/.exec(trimmed);
  if (!match) return { type: 'http', hostport: trimmed };
  return { type: match[1] === 'https' ? 'https' : 'http', hostport: match[2].replace(/\/+$/, '') };
}

interface ProvisionSuccess {
  tenant: { id: string; name: string; slug: string; subdomain: string | null; cloudflareDomainId: string | null };
  user: { id: string; email: string };
  cloudflareJob?: { hostname: string; cloudflareDomainId: string } | null;
}

export default function ProvisionTenantPage() {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    subdomain: '',
    adminEmail: '',
    adminPassword: '',
    planTier: 'STARTER',
    cloudflareApex: '',
    cloudflareZoneId: '',
    originType: 'http' as 'http' | 'https',
    originHostPort: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<ProvisionSuccess | null>(null);
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [defaultOrigin, setDefaultOrigin] = useState<{ type: 'http' | 'https'; hostport: string } | null>(null);
  const [routeStatus, setRouteStatus] = useState<{ status: CfRouteStatus; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('owner_token');
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    async function loadZones() {
      try {
        const res = await fetch('/api/cloudflare/zones', { headers });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setZonesError(err.error ?? `HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as { zones: CloudflareZone[] };
        if (!cancelled) setZones(data.zones);
      } catch {
        if (!cancelled) setZonesError('Network error fetching zones');
      }
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/cloudflare/config', { headers });
        if (!res.ok) return;
        const data = (await res.json()) as { config: CloudflareConfigStatus };
        if (cancelled || !data.config.configured) return;
        const split = splitOrigin(data.config.defaultOrigin);
        setDefaultOrigin(split);
        setForm((f) => ({
          ...f,
          originType: split.type,
          originHostPort: f.originHostPort || split.hostport,
        }));
      } catch {
        // Config isn't critical for the form to render.
      }
    }

    void loadZones();
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedApex = form.cloudflareApex || null;
  const originIsOverride =
    !!defaultOrigin &&
    (form.originType !== defaultOrigin.type || form.originHostPort.trim() !== defaultOrigin.hostport);

  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm((f) => ({
      ...f,
      name,
      slug,
      subdomain: f.subdomain || slug, // Auto-suggest subdomain from slug if not manually set
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('owner_token');
    const payload = {
      name: form.name,
      slug: form.slug,
      subdomain: form.subdomain,
      adminEmail: form.adminEmail,
      adminPassword: form.adminPassword,
      planTier: form.planTier,
      cloudflareDomainApex: form.cloudflareApex || undefined,
      cloudflareDomainZoneId: form.cloudflareZoneId || undefined,
      cfOriginOverride: originIsOverride
        ? `${form.originType}://${form.originHostPort.trim()}`
        : undefined,
    };
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Provisioning failed');
        return;
      }

      setSuccess(data as ProvisionSuccess);
      if ((data as ProvisionSuccess).cloudflareJob) {
        setRouteStatus({ status: 'PENDING', error: null });
      }
    } catch {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  }

  const pollRouteStatus = useCallback(async (tenantId: string) => {
    const token = localStorage.getItem('owner_token');
    const res = await fetch(`/api/tenants/${tenantId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { tenant: { cfRouteStatus: CfRouteStatus; cfRouteError: string | null } };
    return { status: json.tenant.cfRouteStatus, error: json.tenant.cfRouteError };
  }, []);

  useEffect(() => {
    if (!success?.cloudflareJob || !routeStatus) return;
    if (routeStatus.status === 'ACTIVE' || routeStatus.status === 'FAILED' || routeStatus.status === 'NONE') return;

    const tenantId = success.tenant.id;
    let stopped = false;
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (stopped || Date.now() - startedAt > 60_000) {
        clearInterval(interval);
        return;
      }
      const next = await pollRouteStatus(tenantId);
      if (next && !stopped) setRouteStatus(next);
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [success, routeStatus, pollRouteStatus]);

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500 as const,
    color: '#374151',
    marginBottom: 6,
  };

  // ── Success screen ──
  if (success) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#065f46' }}>Tenant Provisioned</h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: '#374151' }}>
            The tenant has been created with default roles, SLA policies, and categories.
          </p>

          <div style={{ backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: 8, padding: 20, textAlign: 'left', marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#111827' }}>Tenant Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>Name:</span>
              <span style={{ color: '#111827', fontWeight: 500 }}>{success.tenant.name}</span>
              <span style={{ color: '#6b7280' }}>Slug:</span>
              <span style={{ color: '#111827', fontFamily: 'monospace' }}>{success.tenant.slug}</span>
              <span style={{ color: '#6b7280' }}>Tenant ID:</span>
              <span style={{ color: '#111827', fontFamily: 'monospace', fontSize: 11 }}>{success.tenant.id}</span>
            </div>

            <h3 style={{ margin: '20px 0 12px', fontSize: 14, fontWeight: 600, color: '#111827' }}>Admin User</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>Email:</span>
              <span style={{ color: '#111827' }}>{success.user.email}</span>
              <span style={{ color: '#6b7280' }}>Password:</span>
              <span style={{ color: '#111827' }}>{form.adminPassword}</span>
            </div>

            <div style={{ marginTop: 16, padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
              The admin can log in at the main app using the slug <strong>{success.tenant.slug}</strong> as the tenant, with the email and password above.
            </div>
          </div>

          {success.cloudflareJob && routeStatus && (
            <div
              style={{
                backgroundColor: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                padding: 20,
                textAlign: 'left',
                marginBottom: 24,
              }}
            >
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#111827' }}>Routing</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>Hostname:</span>
                <span style={{ color: '#111827', fontFamily: 'monospace' }}>{success.cloudflareJob.hostname}</span>
                <span style={{ color: '#6b7280' }}>Status:</span>
                <span>
                  {routeStatus.status === 'PENDING' && (
                    <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, backgroundColor: '#fef9c3', color: '#854d0e' }}>QUEUED</span>
                  )}
                  {routeStatus.status === 'PROVISIONING' && (
                    <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, backgroundColor: '#dbeafe', color: '#1e40af' }}>PROVISIONING…</span>
                  )}
                  {routeStatus.status === 'ACTIVE' && (
                    <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534' }}>ACTIVE</span>
                  )}
                  {routeStatus.status === 'FAILED' && (
                    <span style={{ padding: '2px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, backgroundColor: '#fee2e2', color: '#991b1b' }}>FAILED</span>
                  )}
                </span>
              </div>
              {routeStatus.error && (
                <div style={{ marginTop: 10, padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                  {routeStatus.error}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link
              href={`/tenants/${success.tenant.id}`}
              style={{
                padding: '9px 18px',
                backgroundColor: '#4f46e5',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              View Tenant
            </Link>
            <button
              onClick={() => {
                setSuccess(null);
                setRouteStatus(null);
                setForm({
                  name: '',
                  slug: '',
                  subdomain: '',
                  adminEmail: '',
                  adminPassword: '',
                  planTier: 'STARTER',
                  cloudflareApex: '',
                  cloudflareZoneId: '',
                  originType: defaultOrigin?.type ?? 'http',
                  originHostPort: defaultOrigin?.hostport ?? '',
                });
              }}
              style={{
                padding: '9px 18px',
                backgroundColor: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Create Another
            </button>
            <Link
              href="/tenants"
              style={{
                padding: '9px 18px',
                backgroundColor: '#fff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Back to Tenants
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Link href="/tenants" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4f46e5', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
        &#8592; Back to Tenants
      </Link>

      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: '#111827' }}>Provision New Tenant</h1>
      <p style={{ margin: '0 0 28px', fontSize: 14, color: '#6b7280' }}>
        Create a new tenant with default roles, SLA policies, categories, and an initial admin user.
      </p>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Organization</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Organization Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              style={inputStyle}
              placeholder="Acme Corporation"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Slug *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              required
              pattern="[a-z0-9-]+"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="acme-corporation"
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
              Used as the tenant identifier at login. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Subdomain</label>
            <input
              type="text"
              value={form.subdomain}
              onChange={(e) => setForm((f) => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="acme"
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
              Optional. Used for tenant-specific URLs like <strong>{form.subdomain || 'acme'}.{selectedApex ?? 'meridianitsm.com'}</strong>
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Domain</label>
            <select
              value={form.cloudflareZoneId}
              onChange={(e) => {
                const zoneId = e.target.value;
                const zone = zones.find((z) => z.id === zoneId);
                setForm((f) => ({
                  ...f,
                  cloudflareZoneId: zoneId,
                  cloudflareApex: zone?.name ?? '',
                }));
              }}
              style={inputStyle}
              disabled={zones.length === 0}
            >
              <option value="">No automated DNS (skip Cloudflare)</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            {zonesError ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>
                Could not load zones: {zonesError}. Save Cloudflare credentials in Settings.
              </p>
            ) : zones.length === 0 ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                Loading zones from Cloudflare…
              </p>
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                Pulled live from Cloudflare. A tunnel route + proxied CNAME are created automatically when set.
              </p>
            )}
          </div>

          {form.cloudflareZoneId && (
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Service (origin behind the tunnel)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'start' }}>
                <select
                  value={form.originType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, originType: e.target.value as 'http' | 'https' }))
                  }
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
                <input
                  type="text"
                  value={form.originHostPort}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, originHostPort: e.target.value.trim() }))
                  }
                  placeholder={defaultOrigin?.hostport || 'localhost:3000'}
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                />
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>
                {defaultOrigin
                  ? originIsOverride
                    ? <>Overriding the platform default <code>{defaultOrigin.type}://{defaultOrigin.hostport}</code> for this tenant.</>
                    : <>Prefilled from Settings · <code>{defaultOrigin.type}://{defaultOrigin.hostport}</code></>
                  : 'Set a default origin in Settings → Cloudflare to prefill.'}
              </p>
            </div>
          )}

          <div>
            <label style={labelStyle}>Plan Tier</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PLAN_TIERS.map((tier) => (
                <button
                  type="button"
                  key={tier.value}
                  onClick={() => setForm((f) => ({ ...f, planTier: tier.value }))}
                  style={{
                    padding: '12px 14px',
                    border: form.planTier === tier.value ? '2px solid #4f46e5' : '1px solid #d1d5db',
                    borderRadius: 8,
                    backgroundColor: form.planTier === tier.value ? '#eef2ff' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: form.planTier === tier.value ? '#4f46e5' : '#111827' }}>{tier.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{tier.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#111827' }}>Initial Admin User</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Admin Email *</label>
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              required
              style={inputStyle}
              placeholder="admin@acme.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Admin Password *</label>
            <input
              type="text"
              value={form.adminPassword}
              onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
              required
              minLength={8}
              style={inputStyle}
              placeholder="Minimum 8 characters"
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
              Visible here for setup convenience. The admin should change it after first login.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 24px',
              backgroundColor: loading ? '#94a3b8' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Provisioning...' : 'Provision Tenant'}
          </button>
          <Link href="/tenants" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
