'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeProvider from '@/components/ThemeProvider';
import Icon from '@mdi/react';
import {
  mdiShieldLock,
  mdiCellphone,
  mdiEmailOutline,
  mdiKeyVariant,
  mdiFingerprint,
  mdiLoading,
  mdiAlertCircleOutline,
} from '@mdi/js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MfaMethod {
  id: string;
  type: 'totp' | 'webauthn' | 'email' | 'sms';
  name: string;
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'select'; methods: MfaMethod[]; hasRecoveryCodes: boolean }
  | { kind: 'totp'; deviceId: string }
  | { kind: 'webauthn'; deviceId: string; options: unknown }
  | {
      kind: 'code';
      deviceId: string;
      challengeId: string;
      maskedContact: string;
      type: 'email' | 'sms';
    }
  | { kind: 'recovery' }
  | { kind: 'error'; message: string };

// ─── Component ───────────────────────────────────────────────────────────────

export default function MfaChallengePage() {
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  // Load available MFA methods on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mfa/challenge');
        if (!res.ok) {
          setView({ kind: 'error', message: 'Failed to load MFA methods' });
          return;
        }
        const data = await res.json();
        if (!data.methods || data.methods.length === 0) {
          // No MFA devices — shouldn't happen, redirect to dashboard
          router.push('/dashboard/tickets');
          return;
        }
        setView({
          kind: 'select',
          methods: data.methods,
          hasRecoveryCodes: data.hasRecoveryCodes,
        });
      } catch {
        setView({ kind: 'error', message: 'Network error' });
      }
    })();
  }, [router]);

  // ── Select an MFA method and generate a challenge ─────────────────────────
  async function selectMethod(method: MfaMethod) {
    setError('');
    try {
      const res = await fetch('/api/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: method.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate challenge');
        return;
      }

      if (data.type === 'totp') {
        setView({ kind: 'totp', deviceId: method.id });
      } else if (data.type === 'webauthn') {
        setView({
          kind: 'webauthn',
          deviceId: method.id,
          options: data.options,
        });
        // Auto-trigger WebAuthn
        handleWebAuthn(method.id, data.options);
      } else if (data.type === 'email' || data.type === 'sms') {
        setView({
          kind: 'code',
          deviceId: method.id,
          challengeId: data.challengeId,
          maskedContact: data.maskedContact,
          type: data.type,
        });
      }
    } catch {
      setError('Network error');
    }
  }

  // ── WebAuthn browser API ──────────────────────────────────────────────────
  async function handleWebAuthn(deviceId: string, options: unknown) {
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const authResponse = await startAuthentication({ optionsJSON: options as any });
      await submitVerification({ deviceId, response: authResponse });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'WebAuthn failed';
      setError(msg);
      // Fall back to method selection
      setView((prev) =>
        prev.kind === 'webauthn'
          ? { kind: 'select', methods: [], hasRecoveryCodes: false }
          : prev,
      );
      // Re-fetch methods
      const res = await fetch('/api/mfa/challenge');
      if (res.ok) {
        const data = await res.json();
        setView({
          kind: 'select',
          methods: data.methods,
          hasRecoveryCodes: data.hasRecoveryCodes,
        });
      }
    }
  }

  // ── Submit verification ───────────────────────────────────────────────────
  async function submitVerification(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, trustDevice }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed');
        setSubmitting(false);
        return;
      }
      // Success — cookie updated by the API, redirect
      router.push(data.redirectTo || '/dashboard/tickets');
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    if (view.kind === 'totp') {
      submitVerification({ deviceId: view.deviceId, code });
    } else if (view.kind === 'code') {
      submitVerification({
        deviceId: view.deviceId,
        challengeId: view.challengeId,
        code,
      });
    } else if (view.kind === 'recovery') {
      submitVerification({ type: 'recovery', code });
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <ThemeProvider>
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-secondary)',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 16,
          padding: 32,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: 'var(--badge-indigo-bg)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Icon path={mdiShieldLock} size={1.4} color="var(--accent-primary)" />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Two-Factor Authentication
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
            Verify your identity to continue
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              backgroundColor: 'var(--badge-red-bg-subtle)',
              border: '1px solid var(--badge-red-bg-strong)',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--accent-danger)',
            }}
          >
            <Icon path={mdiAlertCircleOutline} size={0.7} />
            {error}
          </div>
        )}

        {/* Loading */}
        {view.kind === 'loading' && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Icon path={mdiLoading} size={1.2} color="var(--text-muted)" spin />
          </div>
        )}

        {/* Error state */}
        {view.kind === 'error' && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <p style={{ color: 'var(--accent-danger)', marginBottom: 16 }}>{view.message}</p>
            <a href="/login" style={{ color: 'var(--accent-primary)', fontSize: 14 }}>
              Return to login
            </a>
          </div>
        )}

        {/* Method selection */}
        {view.kind === 'select' && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {view.methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectMethod(m)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <Icon
                    path={methodIcon(m.type)}
                    size={1}
                    color="var(--accent-primary)"
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {methodLabel(m.type)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {view.hasRecoveryCodes && (
              <button
                onClick={() => setView({ kind: 'recovery' })}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 16,
                  padding: '10px 16px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                }}
              >
                Use a recovery code
              </button>
            )}
          </div>
        )}

        {/* TOTP code entry */}
        {view.kind === 'totp' && (
          <form onSubmit={handleCodeSubmit}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 24,
                fontFamily: 'monospace',
                textAlign: 'center',
                letterSpacing: '0.3em',
                border: '1px solid var(--border-secondary)',
                borderRadius: 10,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
            <TrustCheckbox checked={trustDevice} onChange={setTrustDevice} />
            <button
              type="submit"
              disabled={code.length !== 6 || submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: code.length === 6 ? 'var(--accent-primary)' : 'var(--text-placeholder)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: code.length === 6 ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Verifying...' : 'Verify'}
            </button>
            <BackButton onBack={() => goBack(setView, setCode, setError)} />
          </form>
        )}

        {/* WebAuthn waiting */}
        {view.kind === 'webauthn' && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Icon path={mdiFingerprint} size={2} color="var(--accent-primary)" />
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 16 }}>
              Follow your browser&apos;s prompt to verify with your security key.
            </p>
            <div style={{ textAlign: 'left' }}>
              <TrustCheckbox checked={trustDevice} onChange={setTrustDevice} />
            </div>
            <BackButton onBack={() => goBack(setView, setCode, setError)} />
          </div>
        )}

        {/* Email / SMS code entry */}
        {view.kind === 'code' && (
          <form onSubmit={handleCodeSubmit}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enter the 6-digit code sent to{' '}
              <strong>{view.maskedContact}</strong>.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 24,
                fontFamily: 'monospace',
                textAlign: 'center',
                letterSpacing: '0.3em',
                border: '1px solid var(--border-secondary)',
                borderRadius: 10,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
            <TrustCheckbox checked={trustDevice} onChange={setTrustDevice} />
            <button
              type="submit"
              disabled={code.length !== 6 || submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: code.length === 6 ? 'var(--accent-primary)' : 'var(--text-placeholder)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: code.length === 6 ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Verifying...' : 'Verify'}
            </button>
            <BackButton onBack={() => goBack(setView, setCode, setError)} />
          </form>
        )}

        {/* Recovery code entry */}
        {view.kind === 'recovery' && (
          <form onSubmit={handleCodeSubmit}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Enter one of your recovery codes.
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 18,
                fontFamily: 'monospace',
                textAlign: 'center',
                letterSpacing: '0.2em',
                border: '1px solid var(--border-secondary)',
                borderRadius: 10,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
            />
            <TrustCheckbox checked={trustDevice} onChange={setTrustDevice} />
            <button
              type="submit"
              disabled={!code.trim() || submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: code.trim() ? 'var(--accent-primary)' : 'var(--text-placeholder)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: code.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Verifying...' : 'Use Recovery Code'}
            </button>
            <BackButton onBack={() => goBack(setView, setCode, setError)} />
          </form>
        )}
      </div>
    </div>
    </ThemeProvider>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function methodIcon(type: string): string {
  switch (type) {
    case 'totp':
      return mdiCellphone;
    case 'webauthn':
      return mdiFingerprint;
    case 'email':
      return mdiEmailOutline;
    case 'sms':
      return mdiCellphone;
    default:
      return mdiKeyVariant;
  }
}

function methodLabel(type: string): string {
  switch (type) {
    case 'totp':
      return 'Authenticator app';
    case 'webauthn':
      return 'Security key / passkey';
    case 'email':
      return 'Email verification code';
    case 'sms':
      return 'SMS verification code';
    default:
      return type;
  }
}

async function goBack(
  setView: React.Dispatch<React.SetStateAction<ViewState>>,
  setCode: React.Dispatch<React.SetStateAction<string>>,
  setError: React.Dispatch<React.SetStateAction<string>>,
) {
  setCode('');
  setError('');
  try {
    const res = await fetch('/api/mfa/challenge');
    if (res.ok) {
      const data = await res.json();
      setView({
        kind: 'select',
        methods: data.methods,
        hasRecoveryCodes: data.hasRecoveryCodes,
      });
    }
  } catch {
    setView({ kind: 'error', message: 'Failed to reload methods' });
  }
}

function TrustCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        fontSize: 13,
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
      />
      Trust this device for 30 days
    </label>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: 'block',
        width: '100%',
        marginTop: 12,
        padding: '10px 16px',
        backgroundColor: 'transparent',
        border: '1px solid var(--border-primary)',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--text-muted)',
      }}
    >
      Back to method selection
    </button>
  );
}
