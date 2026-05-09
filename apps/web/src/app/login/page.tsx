'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ThemeProvider from '@/components/ThemeProvider';

interface SsoConnectionInfo {
  id: string;
  name: string;
  protocol: string;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard/tickets';
  const errorParam = searchParams.get('error') ?? '';
  const signupSuccess = searchParams.get('signup') === 'success';
  const tenantParam = searchParams.get('tenant') ?? '';
  const fromSubdomain = searchParams.get('fromSubdomain') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(tenantParam || 'msp-default');
  const [error, setError] = useState(errorParam);
  const [loading, setLoading] = useState(false);
  const [ssoConnections, setSsoConnections] = useState<SsoConnectionInfo[]>([]);
  const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);

  // Per-tenant custom logo: when the request hit a tenant subdomain, the
  // middleware sets `meridian_subdomain`. Probe the public branding endpoint
  // and swap the default Meridian logo for the tenant's uploaded image when
  // present. 404 → keep default. Sized via object-fit: contain so any X/Y
  // scales into the same area.
  useEffect(() => {
    const sub = readSubdomain();
    if (!sub) return;
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/v1/public/branding/by-subdomain/${encodeURIComponent(sub)}`;
        const res = await fetch(url, { method: 'HEAD' });
        if (!cancelled && res.ok) setCustomLogoUrl(url);
      } catch {
        // ignore — keep default branding
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch SSO connections for the current tenant
  useEffect(() => {
    if (!tenantSlug) return;
    async function fetchSso() {
      try {
        const res = await fetch(`/api/auth/sso/connections/${encodeURIComponent(tenantSlug)}`);
        if (res.ok) {
          const data = (await res.json()) as SsoConnectionInfo[];
          setSsoConnections(data);
        }
      } catch { /* ignore */ }
    }
    void fetchSso();
  }, [tenantSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/auth-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantSlug }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Login failed');
        setLoading(false);
        return;
      }

      window.location.href = callbackUrl;
    } catch (err) {
      setError(`Unable to connect: ${err instanceof Error ? err.message : 'unknown error'}`);
      setLoading(false);
    }
  }

  return (
    <ThemeProvider>
    {/* eslint-disable-next-line @next/next/no-page-custom-font */}
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Montserrat', sans-serif",
    }}>
      {/* Video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/images/mountain-night-bg.jpg"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
        }}
      >
        <source src="/images/hero_animation.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 400, padding: '0 16px' }}>
        {/* Logo + brand. Tenant logo replaces the icon + brand text when
            uploaded; preserves aspect ratio via object-fit: contain inside
            a fixed-height area so any X/Y scales to fit. */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {customLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={customLogoUrl}
              alt="Tenant logo"
              style={{ maxWidth: '100%', maxHeight: 96, objectFit: 'contain' }}
            />
          ) : (
            <>
              <img src="/images/meridian-logo.svg" alt="Meridian ITSM" width={56} height={56} style={{ marginBottom: 12 }} />
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>Meridian ITSM</h1>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: '4px 0 0' }}>IT Service Management</p>
            </>
          )}
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: 32,
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#111827' }}>Sign in</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Enter your credentials to continue</p>

          {signupSuccess && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', color: '#16a34a', borderRadius: 8, fontSize: 13, marginBottom: 16, border: '1px solid #bbf7d0' }}>
              Account created! Your 14-day trial has started. Sign in below.
            </div>
          )}

          {error && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 16, border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          {!fromSubdomain && (
            <>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 4 }}>
                Tenant
              </label>
              <input
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 16, fontSize: 14, boxSizing: 'border-box', outline: 'none', backgroundColor: '#fff' }}
              />
            </>
          )}

          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 16, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />

          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 24, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: loading ? '#93c5fd' : 'linear-gradient(135deg, #0ea5e9, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          {ssoConnections.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>or</span>
                <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
              </div>
              {ssoConnections.map((conn) => (
                <a
                  key={conn.id}
                  href={`/api/auth/sso/oidc/${conn.id}/authorize?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '11px 16px',
                    marginBottom: 8,
                    background: '#f8fafc',
                    color: '#1e293b',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 500,
                    textAlign: 'center',
                    textDecoration: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  Sign in with {conn.name}
                </a>
              ))}
            </>
          )}
        </form>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
          Powered by Meridian ITSM
        </p>
      </div>

      <style>{`
        @keyframes hero-entrance {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        div[style*="zIndex: 2"] {
          animation: hero-entrance 800ms ease 300ms forwards;
          opacity: 0;
        }
      `}</style>
    </div>
    </ThemeProvider>
  );
}

function readSubdomain(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)meridian_subdomain=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}
