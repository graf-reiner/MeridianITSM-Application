'use client';

import { useState, useEffect } from 'react';
import { ownerFetch } from '../lib/api';

interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
}

export default function SmtpSettings() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('25');
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('MeridianITSM');
  const [testTo, setTestTo] = useState('');

  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await ownerFetch('/api/smtp');
        if (res.ok) {
          const data = await res.json() as { config: SmtpConfig | null };
          if (data.config) {
            const c = data.config;
            setHost(c.host);
            setPort(String(c.port));
            setSecure(c.secure);
            setUsername(c.username ?? '');
            setPassword(c.password);
            setFromEmail(c.fromEmail);
            setFromName(c.fromName);
          }
        }
      } catch {
        // ignore load errors — form stays empty
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await ownerFetch('/api/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host,
          port: parseInt(port, 10) || 25,
          secure,
          username: username || undefined,
          password: password || undefined,
          fromEmail,
          fromName,
        }),
      });
      const data = await res.json() as { config?: SmtpConfig; error?: string };
      if (res.ok && data.config) {
        setPassword(data.config.password);
        setSaveStatus({ type: 'success', message: 'SMTP configuration saved successfully.' });
      } else {
        setSaveStatus({ type: 'error', message: data.error ?? 'Failed to save configuration.' });
      }
    } catch {
      setSaveStatus({ type: 'error', message: 'Network error. Could not save configuration.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await ownerFetch('/api/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (res.ok && data.success) {
        setTestStatus({ type: 'success', message: `Test email sent to ${testTo} successfully.` });
      } else {
        setTestStatus({ type: 'error', message: data.error ?? 'Failed to send test email.' });
      }
    } catch {
      setTestStatus({ type: 'error', message: 'Network error. Could not send test email.' });
    } finally {
      setTesting(false);
    }
  }

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
    fontWeight: '500',
    color: '#374151',
    marginBottom: '4px',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: '16px',
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
    fontWeight: '600',
    cursor: saving ? 'not-allowed' : 'pointer',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    backgroundColor: testing ? '#d1d5db' : '#6b7280',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '9px 20px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: testing ? 'not-allowed' : 'pointer',
  };

  if (loading) {
    return (
      <div style={{ color: '#6b7280', fontSize: '14px', padding: '16px 0' }}>
        Loading SMTP configuration...
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
        SMTP Configuration
      </h2>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Configure the outbound SMTP relay used for system emails (tenant notifications, password resets, etc).
      </p>

      {/* SMTP Settings Form */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#374151', marginTop: 0, marginBottom: '20px' }}>
          Server Settings
        </h3>
        <form onSubmit={handleSave}>
          {/* Host & Port row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>SMTP Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.example.com"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="25"
                min={1}
                max={65535}
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Secure */}
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              id="smtp-secure"
              type="checkbox"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="smtp-secure" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              Use TLS/SSL (enable for port 465)
            </label>
          </div>

          {/* Username & Password row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Username (optional)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="smtp-user@example.com"
                style={inputStyle}
                autoComplete="off"
              />
            </div>
            <div>
              <label style={labelStyle}>Password (optional)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep existing"
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* From Email & From Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>From Email</label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@example.com"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>From Name</label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="MeridianITSM"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Save status */}
          {saveStatus && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                backgroundColor: saveStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: saveStatus.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${saveStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              {saveStatus.message}
            </div>
          )}

          <button type="submit" disabled={saving} style={primaryButtonStyle}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      </div>

      {/* Test Email Section */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
          Send Test Email
        </h3>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
          Send a test message to verify the SMTP configuration is working correctly.
        </p>
        <form onSubmit={handleTest} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Recipient Email</label>
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={testing} style={{ ...secondaryButtonStyle, flexShrink: 0, marginBottom: '0' }}>
            {testing ? 'Sending...' : 'Send Test'}
          </button>
        </form>

        {/* Test status */}
        {testStatus && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              backgroundColor: testStatus.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: testStatus.type === 'success' ? '#166534' : '#991b1b',
              border: `1px solid ${testStatus.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {testStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}
