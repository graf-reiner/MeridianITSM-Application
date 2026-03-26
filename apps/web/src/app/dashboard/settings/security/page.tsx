'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '@mdi/react';
import {
  mdiShieldLock,
  mdiPlus,
  mdiDelete,
  mdiCellphone,
  mdiFingerprint,
  mdiEmailOutline,
  mdiKeyVariant,
  mdiLoading,
  mdiAlertCircleOutline,
  mdiCheckCircle,
  mdiClockOutline,
  mdiArrowLeft,
} from '@mdi/js';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MfaDevice {
  id: string;
  type: string;
  name: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

type EnrollStep =
  | null
  | { step: 'select-type' }
  | {
      step: 'totp-qr';
      deviceId: string;
      qrCode: string;
      secret: string;
    }
  | { step: 'webauthn-register'; deviceId: string; options: unknown }
  | {
      step: 'code-verify';
      deviceId: string;
      challengeId?: string;
      type: 'totp' | 'email' | 'sms';
    }
  | { step: 'recovery-codes'; codes: string[] };

// ─── Component ───────────────────────────────────────────────────────────────

export default function SecuritySettingsPage() {
  const [devices, setDevices] = useState<MfaDevice[]>([]);
  const [recoveryCodeCount, setRecoveryCodeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enroll, setEnroll] = useState<EnrollStep>(null);
  const [code, setCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [contactValue, setContactValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/mfa/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices);
        setRecoveryCodeCount(data.recoveryCodeCount);
      }
    } catch {
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // ── Start enrollment ──────────────────────────────────────────────────────
  async function startEnrollment(type: 'totp' | 'webauthn' | 'email' | 'sms') {
    if (!deviceName.trim()) {
      setError('Please enter a device name');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const body: Record<string, string> = { type, name: deviceName.trim() };
      if ((type === 'email' || type === 'sms') && contactValue) {
        body.contactValue = contactValue;
      }

      const res = await fetch('/api/mfa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Enrollment failed');
        setSubmitting(false);
        return;
      }

      if (type === 'totp') {
        setEnroll({
          step: 'totp-qr',
          deviceId: data.deviceId,
          qrCode: data.qrCode,
          secret: data.secret,
        });
      } else if (type === 'webauthn') {
        setEnroll({
          step: 'webauthn-register',
          deviceId: data.deviceId,
          options: data.options,
        });
        // Auto-trigger WebAuthn registration
        handleWebAuthnRegistration(data.deviceId, data.options);
      } else if (type === 'email' || type === 'sms') {
        setEnroll({
          step: 'code-verify',
          deviceId: data.deviceId,
          challengeId: data.challengeId,
          type,
        });
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── WebAuthn registration ─────────────────────────────────────────────────
  async function handleWebAuthnRegistration(
    deviceId: string,
    options: unknown,
  ) {
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const regResponse = await startRegistration({ optionsJSON: options as any });

      const res = await fetch('/api/mfa/enroll/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, response: regResponse }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        setEnroll(null);
        return;
      }

      if (data.recoveryCodes) {
        setEnroll({ step: 'recovery-codes', codes: data.recoveryCodes });
      } else {
        setEnroll(null);
        fetchDevices();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'WebAuthn failed';
      setError(msg);
      setEnroll(null);
    }
  }

  // ── Verify enrollment code ────────────────────────────────────────────────
  async function verifyEnrollment(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll || !code.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      let payload: Record<string, string> = {};

      if (enroll.step === 'totp-qr') {
        payload = { deviceId: enroll.deviceId, code };
      } else if (enroll.step === 'code-verify' && enroll.challengeId) {
        payload = {
          deviceId: enroll.deviceId,
          challengeId: enroll.challengeId,
          code,
        };
      }

      const res = await fetch('/api/mfa/enroll/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Verification failed');
        setSubmitting(false);
        return;
      }

      if (data.recoveryCodes) {
        setEnroll({ step: 'recovery-codes', codes: data.recoveryCodes });
      } else {
        setEnroll(null);
        fetchDevices();
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
      setCode('');
    }
  }

  // ── Delete device ─────────────────────────────────────────────────────────
  async function deleteDevice(deviceId: string) {
    if (!confirm('Remove this MFA device?')) return;

    try {
      const res = await fetch('/api/mfa/devices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to remove device');
        return;
      }
      fetchDevices();
    } catch {
      setError('Network error');
    }
  }

  // ── Reset enrollment form ─────────────────────────────────────────────────
  function resetEnroll() {
    setEnroll(null);
    setCode('');
    setDeviceName('');
    setContactValue('');
    setError('');
    fetchDevices();
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Link
          href="/dashboard/settings"
          style={{ color: '#6b7280', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827' }}>
          Security
        </h1>
      </div>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Manage your two-factor authentication devices.
      </p>

      {/* Error banner */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          <Icon path={mdiAlertCircleOutline} size={0.7} />
          {error}
          <button
            onClick={() => setError('')}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#dc2626',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Icon path={mdiLoading} size={1.2} color="#6b7280" spin />
        </div>
      )}

      {/* ── Recovery codes displayed after first enrollment ──────────────── */}
      {enroll?.step === 'recovery-codes' && (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#111827' }}>
            Save Your Recovery Codes
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
            Store these codes in a safe place. Each can be used once if you lose
            access to your MFA device.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              backgroundColor: '#f9fafb',
              borderRadius: 8,
              padding: 16,
              fontFamily: 'monospace',
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {enroll.codes.map((c, i) => (
              <div key={i} style={{ color: '#111827' }}>
                {c}
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(enroll.codes.join('\n'));
            }}
            style={{
              marginRight: 8,
              padding: '8px 16px',
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Copy to clipboard
          </button>
          <button
            onClick={resetEnroll}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* ── Enrollment flow ──────────────────────────────────────────────── */}
      {enroll && enroll.step !== 'recovery-codes' && (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          {/* Step: select type */}
          {enroll.step === 'select-type' && (
            <>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#111827' }}>
                Add MFA Device
              </h2>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: 4,
                }}
              >
                Device name
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g., My Phone"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                  marginBottom: 16,
                  boxSizing: 'border-box',
                }}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                }}
              >
                {(
                  [
                    ['totp', mdiCellphone, 'Authenticator App', 'Google Authenticator, Authy, etc.'],
                    ['webauthn', mdiFingerprint, 'Security Key', 'YubiKey, passkey, etc.'],
                    ['email', mdiEmailOutline, 'Email Code', 'Verification code via email'],
                    ['sms', mdiCellphone, 'SMS Code', 'Verification code via text'],
                  ] as const
                ).map(([type, icon, label, desc]) => (
                  <button
                    key={type}
                    onClick={() => {
                      if (type === 'email' || type === 'sms') {
                        const val = prompt(
                          type === 'email'
                            ? 'Enter your email address:'
                            : 'Enter your phone number:',
                        );
                        if (!val) return;
                        setContactValue(val);
                        // Need to delay to let state update, so call directly
                        startEnrollmentWithContact(type, val);
                        return;
                      }
                      startEnrollment(type);
                    }}
                    disabled={submitting}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 8,
                      padding: 16,
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <Icon path={icon} size={1.2} color="#4f46e5" />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{desc}</div>
                  </button>
                ))}
              </div>

              <button
                onClick={resetEnroll}
                style={{
                  marginTop: 12,
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#6b7280',
                  width: '100%',
                }}
              >
                Cancel
              </button>
            </>
          )}

          {/* Step: TOTP QR code */}
          {enroll.step === 'totp-qr' && (
            <form onSubmit={verifyEnrollment}>
              <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#111827' }}>
                Set Up Authenticator
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
                Scan this QR code with your authenticator app, then enter the code.
              </p>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enroll.qrCode}
                  alt="TOTP QR Code"
                  style={{ width: 200, height: 200 }}
                />
              </div>
              <p style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 16 }}>
                Manual entry key: <code style={{ wordBreak: 'break-all' }}>{enroll.secret}</code>
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit code"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 18,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: '0.2em',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  marginBottom: 12,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={resetEnroll}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={code.length !== 6 || submitting}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: code.length === 6 ? '#4f46e5' : '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: code.length === 6 ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {submitting ? 'Verifying...' : 'Verify & Activate'}
                </button>
              </div>
            </form>
          )}

          {/* Step: WebAuthn waiting */}
          {enroll.step === 'webauthn-register' && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Icon path={mdiFingerprint} size={2} color="#4f46e5" />
              <p style={{ fontSize: 14, color: '#374151', marginTop: 16 }}>
                Follow your browser&apos;s prompt to register your security key.
              </p>
              <button
                onClick={resetEnroll}
                style={{
                  marginTop: 16,
                  padding: '8px 16px',
                  backgroundColor: '#fff',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Step: Email/SMS code verification */}
          {enroll.step === 'code-verify' && (
            <form onSubmit={verifyEnrollment}>
              <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#111827' }}>
                Verify {enroll.type === 'email' ? 'Email' : 'Phone'}
              </h2>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
                Enter the 6-digit code we sent to verify your {enroll.type === 'email' ? 'email address' : 'phone number'}.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 18,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: '0.2em',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  marginBottom: 12,
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={resetEnroll}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={code.length !== 6 || submitting}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: code.length === 6 ? '#4f46e5' : '#9ca3af',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: code.length === 6 ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {submitting ? 'Verifying...' : 'Verify & Activate'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Device list ──────────────────────────────────────────────────── */}
      {!loading && !enroll && (
        <>
          <div
            style={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
                MFA Devices
              </h2>
              <button
                onClick={() => setEnroll({ step: 'select-type' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  backgroundColor: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Icon path={mdiPlus} size={0.7} />
                Add Device
              </button>
            </div>

            {devices.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                <Icon
                  path={mdiShieldLock}
                  size={2}
                  color="#e5e7eb"
                  style={{ marginBottom: 12 }}
                />
                <p style={{ margin: 0 }}>
                  No MFA devices configured. Add one to secure your account.
                </p>
              </div>
            ) : (
              devices.map((device) => (
                <div
                  key={device.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 20px',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: '#eef2ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      path={deviceIcon(device.type)}
                      size={0.9}
                      color="#4f46e5"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                      {device.name}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: '#6b7280',
                      }}
                    >
                      <span>{deviceTypeLabel(device.type)}</span>
                      <span style={{ color: '#d1d5db' }}>|</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          color: device.status === 'active' ? '#059669' : '#d97706',
                        }}
                      >
                        <Icon
                          path={
                            device.status === 'active'
                              ? mdiCheckCircle
                              : mdiClockOutline
                          }
                          size={0.5}
                        />
                        {device.status === 'active' ? 'Active' : 'Pending'}
                      </span>
                      {device.lastUsedAt && (
                        <>
                          <span style={{ color: '#d1d5db' }}>|</span>
                          <span>
                            Last used {new Date(device.lastUsedAt).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteDevice(device.id)}
                    title="Remove device"
                    style={{
                      padding: 6,
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 6,
                      color: '#9ca3af',
                      flexShrink: 0,
                    }}
                  >
                    <Icon path={mdiDelete} size={0.8} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Recovery codes info */}
          {devices.some((d) => d.status === 'active') && (
            <div
              style={{
                marginTop: 16,
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: '16px 20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: '#111827',
                  fontWeight: 500,
                }}
              >
                <Icon path={mdiKeyVariant} size={0.8} color="#4f46e5" />
                Recovery Codes
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                {recoveryCodeCount > 0
                  ? `${recoveryCodeCount} recovery codes remaining.`
                  : 'No recovery codes remaining. Add a new MFA device to regenerate them.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Helper for email/sms with contact value ─────────────────────────────
  async function startEnrollmentWithContact(
    type: 'email' | 'sms',
    contact: string,
  ) {
    if (!deviceName.trim()) {
      setError('Please enter a device name');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/mfa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          name: deviceName.trim(),
          contactValue: contact,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Enrollment failed');
        setSubmitting(false);
        return;
      }

      setEnroll({
        step: 'code-verify',
        deviceId: data.deviceId,
        challengeId: data.challengeId,
        type,
      });
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deviceIcon(type: string): string {
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

function deviceTypeLabel(type: string): string {
  switch (type) {
    case 'totp':
      return 'Authenticator App';
    case 'webauthn':
      return 'Security Key';
    case 'email':
      return 'Email';
    case 'sms':
      return 'SMS';
    default:
      return type;
  }
}
