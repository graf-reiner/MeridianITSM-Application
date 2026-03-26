'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard/tickets';
  const errorParam = searchParams.get('error') ?? '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('msp-default');
  const [error, setError] = useState(errorParam);
  const [loading, setLoading] = useState(false);

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

      // Cookie was set by the server via Set-Cookie header
      // Hard redirect to dashboard
      window.location.href = callbackUrl;
    } catch (err) {
      setError(`Unable to connect: ${err instanceof Error ? err.message : 'unknown error'}`);
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'url(/images/hero-bg.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
    }}>
      {/* Dark overlay for readability */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, padding: '0 16px' }}>
        {/* Logo + brand */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/images/meridian-logo.svg" alt="Meridian ITSM" width={56} height={56} style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>Meridian ITSM</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: '4px 0 0' }}>IT Service Management</p>
        </div>

        {/* Login card */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: 32,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#1e293b' }}>Sign in</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Enter your credentials to continue</p>

          {error && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 16, border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#1e293b', marginBottom: 4 }}>
            Tenant
          </label>
          <input
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 16, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />

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
        </form>
      </div>
    </div>
  );
}
