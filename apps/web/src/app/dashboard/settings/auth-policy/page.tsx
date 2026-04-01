'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiShieldLockOutline } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthSettings {
  id: string;
  tenantId: string;
  allowLocalAuth: boolean;
  allowOidcSso: boolean;
  allowSamlSso: boolean;
  enforceSso: boolean;
  mfaPolicy: string;
  mfaGracePeriodDays: number;
  allowedMfaTypes: string[];
  sessionMaxAgeMins: number;
  sessionIdleTimeoutMins: number;
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordMaxAgeDays: number;
}

// ─── Auth Policy Page ─────────────────────────────────────────────────────────

export default function AuthPolicySettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AuthSettings>({
    queryKey: ['settings-auth-policy'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/auth-policy', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load auth settings');
      return res.json() as Promise<AuthSettings>;
    },
  });

  // Form state
  const [allowLocalAuth, setAllowLocalAuth] = useState(true);
  const [allowOidcSso, setAllowOidcSso] = useState(false);
  const [allowSamlSso, setAllowSamlSso] = useState(false);
  const [enforceSso, setEnforceSso] = useState(false);
  const [mfaPolicy, setMfaPolicy] = useState('optional');
  const [mfaGracePeriodDays, setMfaGracePeriodDays] = useState(7);
  const [allowedMfaTypes, setAllowedMfaTypes] = useState<string[]>([
    'totp',
    'webauthn',
    'email',
    'sms',
  ]);
  const [sessionMaxAgeMins, setSessionMaxAgeMins] = useState(480);
  const [sessionIdleTimeoutMins, setSessionIdleTimeoutMins] = useState(60);
  const [passwordMinLength, setPasswordMinLength] = useState(12);
  const [passwordRequireUpper, setPasswordRequireUpper] = useState(true);
  const [passwordRequireLower, setPasswordRequireLower] = useState(true);
  const [passwordRequireNumber, setPasswordRequireNumber] = useState(true);
  const [passwordRequireSymbol, setPasswordRequireSymbol] = useState(true);
  const [passwordMaxAgeDays, setPasswordMaxAgeDays] = useState(90);

  // Populate form when data loads
  useEffect(() => {
    if (data) {
      setAllowLocalAuth(data.allowLocalAuth);
      setAllowOidcSso(data.allowOidcSso);
      setAllowSamlSso(data.allowSamlSso);
      setEnforceSso(data.enforceSso);
      setMfaPolicy(data.mfaPolicy);
      setMfaGracePeriodDays(data.mfaGracePeriodDays);
      setAllowedMfaTypes(data.allowedMfaTypes);
      setSessionMaxAgeMins(data.sessionMaxAgeMins);
      setSessionIdleTimeoutMins(data.sessionIdleTimeoutMins);
      setPasswordMinLength(data.passwordMinLength);
      setPasswordRequireUpper(data.passwordRequireUpper);
      setPasswordRequireLower(data.passwordRequireLower);
      setPasswordRequireNumber(data.passwordRequireNumber);
      setPasswordRequireSymbol(data.passwordRequireSymbol);
      setPasswordMaxAgeDays(data.passwordMaxAgeDays);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/v1/settings/auth-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error ?? 'Failed to save auth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings-auth-policy'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      allowLocalAuth,
      allowOidcSso,
      allowSamlSso,
      enforceSso,
      mfaPolicy,
      mfaGracePeriodDays,
      allowedMfaTypes,
      sessionMaxAgeMins,
      sessionIdleTimeoutMins,
      passwordMinLength,
      passwordRequireUpper,
      passwordRequireLower,
      passwordRequireNumber,
      passwordRequireSymbol,
      passwordMaxAgeDays,
    });
  };

  const toggleMfaType = (type: string) => {
    setAllowedMfaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  };
  const sectionStyle = {
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  };
  const sectionTitleStyle = {
    margin: '0 0 16px',
    fontSize: 16,
    fontWeight: 700 as const,
    color: 'var(--text-primary)',
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading auth settings...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/dashboard/settings"
          style={{
            color: 'var(--text-muted)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiShieldLockOutline} size={1} color="#7c3aed" />
          Authentication Policy
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Auth Methods ──────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Authentication Methods</h2>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={allowLocalAuth}
                onChange={(e) => setAllowLocalAuth(e.target.checked)}
              />
              <span>Allow local (email/password) authentication</span>
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={allowOidcSso}
                onChange={(e) => setAllowOidcSso(e.target.checked)}
              />
              <span>Allow OIDC SSO</span>
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={allowSamlSso}
                onChange={(e) => setAllowSamlSso(e.target.checked)}
              />
              <span>Allow SAML SSO</span>
            </label>
          </div>
          <div style={{ marginBottom: 4 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={enforceSso}
                onChange={(e) => setEnforceSso(e.target.checked)}
              />
              <span>Enforce SSO for all users</span>
            </label>
            <p
              style={{
                margin: '4px 0 0 26px',
                fontSize: 12,
                color: 'var(--accent-warning)',
              }}
            >
              When enabled, local auth is hidden for non-admin users
            </p>
          </div>
        </div>

        {/* ── MFA Policy ───────────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>MFA Policy</h2>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="ap-mfa-policy" style={labelStyle}>
              MFA Policy
            </label>
            <select
              id="ap-mfa-policy"
              value={mfaPolicy}
              onChange={(e) => setMfaPolicy(e.target.value)}
              style={inputStyle}
            >
              <option value="disabled">Disabled</option>
              <option value="optional">Optional</option>
              <option value="required">Required</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="ap-mfa-grace" style={labelStyle}>
              MFA Grace Period (days)
            </label>
            <input
              id="ap-mfa-grace"
              type="number"
              min={0}
              value={mfaGracePeriodDays}
              onChange={(e) => setMfaGracePeriodDays(Number(e.target.value))}
              style={{ ...inputStyle, maxWidth: 160 }}
            />
          </div>

          <div>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Allowed MFA Types</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {['totp', 'webauthn', 'email', 'sms'].map((type) => (
                <label
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allowedMfaTypes.includes(type)}
                    onChange={() => toggleMfaType(type)}
                  />
                  <span style={{ textTransform: 'uppercase' }}>{type}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Session Policy ───────────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Session Policy</h2>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="ap-session-max" style={labelStyle}>
              Session max age (minutes)
            </label>
            <input
              id="ap-session-max"
              type="number"
              min={1}
              value={sessionMaxAgeMins}
              onChange={(e) => setSessionMaxAgeMins(Number(e.target.value))}
              style={{ ...inputStyle, maxWidth: 160 }}
            />
          </div>

          <div>
            <label htmlFor="ap-session-idle" style={labelStyle}>
              Session idle timeout (minutes)
            </label>
            <input
              id="ap-session-idle"
              type="number"
              min={1}
              value={sessionIdleTimeoutMins}
              onChange={(e) => setSessionIdleTimeoutMins(Number(e.target.value))}
              style={{ ...inputStyle, maxWidth: 160 }}
            />
          </div>
        </div>

        {/* ── Password Policy (only when local auth is enabled) ──── */}
        {allowLocalAuth && (
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Password Policy</h2>

            <div style={{ marginBottom: 16 }}>
              <label htmlFor="ap-pw-min-length" style={labelStyle}>
                Minimum length
              </label>
              <input
                id="ap-pw-min-length"
                type="number"
                min={6}
                max={128}
                value={passwordMinLength}
                onChange={(e) => setPasswordMinLength(Number(e.target.value))}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={passwordRequireUpper}
                  onChange={(e) => setPasswordRequireUpper(e.target.checked)}
                />
                <span>Require uppercase letter</span>
              </label>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={passwordRequireLower}
                  onChange={(e) => setPasswordRequireLower(e.target.checked)}
                />
                <span>Require lowercase letter</span>
              </label>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={passwordRequireNumber}
                  onChange={(e) => setPasswordRequireNumber(e.target.checked)}
                />
                <span>Require number</span>
              </label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={passwordRequireSymbol}
                  onChange={(e) => setPasswordRequireSymbol(e.target.checked)}
                />
                <span>Require symbol</span>
              </label>
            </div>

            <div>
              <label htmlFor="ap-pw-max-age" style={labelStyle}>
                Password max age (days)
              </label>
              <input
                id="ap-pw-max-age"
                type="number"
                min={0}
                value={passwordMaxAgeDays}
                onChange={(e) => setPasswordMaxAgeDays(Number(e.target.value))}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
                Set to 0 to disable password expiration
              </p>
            </div>
          </div>
        )}

        {/* ── Save / Status ────────────────────────────────────────── */}
        {mutation.isSuccess && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--badge-green-bg-subtle)',
              border: '1px solid #bbf7d0',
              borderRadius: 7,
              marginBottom: 14,
              color: '#15803d',
              fontSize: 13,
            }}
          >
            Settings saved successfully.
          </div>
        )}
        {mutation.isError && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--badge-red-bg-subtle)',
              border: '1px solid #fecaca',
              borderRadius: 7,
              marginBottom: 14,
              color: 'var(--accent-danger)',
              fontSize: 13,
            }}
          >
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Failed to save settings'}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={mutation.isPending}
            style={{
              padding: '10px 24px',
              backgroundColor: mutation.isPending ? '#a5b4fc' : 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
