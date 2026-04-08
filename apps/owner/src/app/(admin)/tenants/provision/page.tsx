'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PLAN_TIERS = [
  { value: 'STARTER', label: 'Starter', desc: '5 users, basic features' },
  { value: 'PROFESSIONAL', label: 'Professional', desc: '25 users, SLA, API access' },
  { value: 'BUSINESS', label: 'Business', desc: '100 users, CMDB, mobile' },
  { value: 'ENTERPRISE', label: 'Enterprise', desc: 'Unlimited users, SSO, webhooks' },
];

export default function ProvisionTenantPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    subdomain: '',
    adminEmail: '',
    adminPassword: '',
    planTier: 'STARTER',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ tenant: { id: string; name: string; slug: string }; user: { id: string; email: string } } | null>(null);

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
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Provisioning failed');
        return;
      }

      setSuccess(data);
    } catch {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  }

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
              onClick={() => { setSuccess(null); setForm({ name: '', slug: '', subdomain: '', adminEmail: '', adminPassword: '', planTier: 'STARTER' }); }}
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
              Optional. Used for tenant-specific URLs like <strong>{form.subdomain || 'acme'}.meridianitsm.com</strong>
            </p>
          </div>

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
