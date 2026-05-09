'use client';

import { useState, useEffect } from 'react';
import { ownerFetch } from '../lib/api';

interface PlatformSettingsResponse {
  appUrl: string;
  appUrlSource: 'db' | 'env' | 'unset';
  updatedAt: string | null;
}

export default function PlatformSettings() {
  const [appUrl, setAppUrl] = useState('');
  const [source, setSource] = useState<'db' | 'env' | 'unset'>('unset');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await ownerFetch('/api/platform-settings');
        if (!res.ok) return;
        const data = (await res.json()) as PlatformSettingsResponse;
        setAppUrl(data.appUrl);
        setSource(data.appUrlSource);
        setUpdatedAt(data.updatedAt);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await ownerFetch('/api/platform-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUrl }),
      });
      const data = (await res.json()) as PlatformSettingsResponse & { error?: string };
      if (res.ok) {
        setAppUrl(data.appUrl);
        setSource(data.appUrlSource);
        setUpdatedAt(data.updatedAt);
        setStatus({ type: 'success', message: 'Saved.' });
      } else {
        setStatus({ type: 'error', message: data.error ?? 'Failed to save.' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' });
    } finally {
      setSaving(false);
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
  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
  };

  if (loading) {
    return <div style={{ color: '#6b7280', fontSize: '14px', padding: '16px 0' }}>Loading platform settings...</div>;
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
        Platform Settings
      </h2>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Operator-editable platform configuration. These values are read by integration setups
        (OAuth callbacks, redirect URIs) so they can change without editing .env on the server.
      </p>

      <div style={sectionStyle}>
        <form onSubmit={handleSave}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
            Application URL
          </label>
          <input
            type="text"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="https://app-test.meridianitsm.com"
            required
            style={inputStyle}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>
            Public-facing platform URL. Used to build the OAuth callback in the Microsoft 365 / Google
            integration wizard, and any other place a fully-qualified host is needed.
            {source === 'env' && <> Currently sourced from <code>APP_URL</code> env var; saving here overrides it.</>}
            {source === 'db' && updatedAt && <> Last updated {new Date(updatedAt).toLocaleString()}.</>}
            {source === 'unset' && <> No value set yet — the integration wizard's redirect URI will be missing the host.</>}
          </p>

          {status && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 13,
                backgroundColor: status.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: status.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${status.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              }}
            >
              {status.message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: 16,
              backgroundColor: saving ? '#818cf8' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '9px 20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
