'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiUploadOutline, mdiTrashCanOutline, mdiImageOutline, mdiLoading } from '@mdi/js';
import { apiFetch } from '../../../../lib/api';

interface BrandingResponse {
  companyName: string | null;
  logoUrl: string | null; // storage key (e.g. "{tenantId}/branding/logo-...png")
  primaryColor: string | null;
  accentColor: string | null;
}

interface UploadResponse {
  storageKey: string;
  signedUrl: string;
  message: string;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;

export default function BrandingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<BrandingResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/settings/branding');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BrandingResponse;
      setBranding(data);
      // Use the public-by-subdomain endpoint so we don't need a fresh signed
      // URL on every page load. Cache-busted with the storage key fragment.
      if (data.logoUrl) {
        const sub = readSubdomainCookie();
        if (sub) {
          // Use a fragment of the storage key as the cache buster — changes
          // each upload (the upload route timestamps the filename).
          const v = encodeURIComponent(data.logoUrl.split('/').pop() ?? Date.now().toString());
          setPreviewUrl(`/api/v1/public/branding/by-subdomain/${encodeURIComponent(sub)}?v=${v}`);
        }
      } else {
        setPreviewUrl(null);
      }
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load branding' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ type: 'error', message: 'Unsupported file type. Allowed: PNG, JPEG, GIF, WebP, SVG.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus({ type: 'error', message: 'File too large. Maximum 2 MB.' });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // apiFetch sets Content-Type: application/json by default — strip it so
      // the browser writes its own multipart boundary header.
      const token = document.cookie.match(/(?:^|;\s*)meridian_session=([^;]*)/)?.[1];
      const res = await fetch('/api/v1/settings/branding/logo', {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${decodeURIComponent(token)}` } : undefined,
      });
      const data = (await res.json()) as UploadResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus({ type: 'success', message: 'Logo uploaded.' });
      await load();
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemove() {
    if (!confirm('Remove the custom logo? The login page will revert to the default Meridian branding.')) return;
    setRemoving(true);
    setStatus(null);
    try {
      const res = await apiFetch('/api/v1/settings/branding', {
        method: 'PATCH',
        body: JSON.stringify({ logoUrl: null }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setStatus({ type: 'success', message: 'Logo removed.' });
      await load();
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Remove failed' });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 800 }}>
      <Link
        href="/dashboard/settings"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4f46e5', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}
      >
        <Icon path={mdiArrowLeft} size={0.7} /> Back to Settings
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Branding</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>
        Upload a custom logo to display on your tenant&apos;s login page in place of the default Meridian branding.
        The image is scaled to fit while preserving its aspect ratio.
      </p>

      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: '0 0 16px' }}>Current Logo</h2>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: 32,
            minHeight: 140,
            marginBottom: 16,
          }}
        >
          {loading ? (
            <Icon path={mdiLoading} size={1.2} spin color="#94a3b8" />
          ) : previewUrl ? (
            // The display contract: any uploaded image's intrinsic X/Y is
            // scaled to fit within ~80px height while preserving aspect ratio.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Tenant logo"
              style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#94a3b8' }}>
              <Icon path={mdiImageOutline} size={1.5} />
              <span style={{ fontSize: 13 }}>No custom logo set — using default branding</span>
            </div>
          )}
        </div>

        {status && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
              backgroundColor: status.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: status.type === 'success' ? '#166534' : '#991b1b',
              border: `1px solid ${status.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {status.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => void handleFileChange(e)}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 16px',
              backgroundColor: uploading ? '#818cf8' : '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            <Icon path={mdiUploadOutline} size={0.8} />
            {uploading ? 'Uploading…' : branding?.logoUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {branding?.logoUrl && (
            <button
              type="button"
              disabled={removing}
              onClick={() => void handleRemove()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                backgroundColor: 'transparent',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                cursor: removing ? 'not-allowed' : 'pointer',
              }}
            >
              <Icon path={mdiTrashCanOutline} size={0.8} />
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>

        <p style={{ margin: '14px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Allowed formats: PNG, JPEG, GIF, WebP, SVG. Maximum 2 MB. Tip: use a transparent background so the logo
          looks clean on the login page&apos;s dark hero image.
        </p>
      </div>
    </div>
  );
}

function readSubdomainCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)meridian_subdomain=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}
