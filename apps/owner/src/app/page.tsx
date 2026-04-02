'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OwnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [totpPending, setTotpPending] = useState(false);
  const [tempToken, setTempToken] = useState('');

  // If already logged in, redirect to dashboard
  useEffect(() => {
    const token = localStorage.getItem('owner_token');
    if (token) router.replace('/dashboard');
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      if (data.requiresTotp) {
        setTotpPending(true);
        setTempToken(data.tempToken);
        return;
      }

      // Success — store tokens and redirect
      localStorage.setItem('owner_token', data.accessToken);
      localStorage.setItem('owner_refresh_token', data.refreshToken);
      router.push('/dashboard');
    } catch {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/totp-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: totpCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid code');
        return;
      }

      localStorage.setItem('owner_token', data.accessToken);
      localStorage.setItem('owner_refresh_token', data.refreshToken);
      router.push('/dashboard');
    } catch {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: '40px 32px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/images/meridian-logo.svg" alt="Meridian ITSM" width={52} height={52} style={{ marginBottom: 12 }} />
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#111827' }}>
            MeridianITSM
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>Owner Administration</p>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              color: '#dc2626',
            }}
          >
            {error}
          </div>
        )}

        {!totpPending ? (
          /* Login Form */
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder="admin@company.com"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: loading ? '#94a3b8' : '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          /* TOTP Verification */
          <form onSubmit={handleTotp}>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <div style={{ marginBottom: 24 }}>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 20,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: '0.5em',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: loading || totpCode.length !== 6 ? '#94a3b8' : '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || totpCode.length !== 6 ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => { setTotpPending(false); setTempToken(''); setTotpCode(''); setError(''); }}
              style={{
                width: '100%',
                padding: '8px',
                marginTop: 8,
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Back to login
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 24, marginBottom: 0 }}>
          This portal is restricted to platform administrators only.
        </p>
      </div>
    </div>
  );
}
