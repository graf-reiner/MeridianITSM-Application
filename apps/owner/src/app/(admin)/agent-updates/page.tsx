'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ownerFetch } from '../../../lib/api';

type Platform = 'WINDOWS' | 'LINUX' | 'MACOS';

interface AgentUpdate {
  id: string;
  version: string;
  platform: Platform;
  fileSize: number;
  checksum: string;
  releaseNotes: string | null;
  createdAt: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  WINDOWS: 'Windows',
  LINUX: 'Linux',
  MACOS: 'macOS',
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function AgentUpdatesPage() {
  const [updates, setUpdates] = useState<AgentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadPlatform, setUploadPlatform] = useState<Platform>('WINDOWS');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUpdates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ownerFetch('/api/agent-updates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { updates: AgentUpdate[] };
      setUpdates(data.updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load updates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUpdates();
  }, [fetchUpdates]);

  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadSuccess(null);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Select a file.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (uploadVersion.trim()) formData.append('version', uploadVersion.trim());
      formData.append('platform', uploadPlatform);
      if (releaseNotes.trim()) formData.append('releaseNotes', releaseNotes.trim());

      const res = await ownerFetch('/api/agent-updates', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Upload failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { version?: string };
      setUploadSuccess(`Package v${data.version ?? uploadVersion.trim()} (${uploadPlatform}) uploaded.`);
      setUploadVersion('');
      setReleaseNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchUpdates();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [uploadVersion, uploadPlatform, releaseNotes, fetchUpdates]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(true);
    try {
      const res = await ownerFetch(`/api/agent-updates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmDeleteId(null);
      await fetchUpdates();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }, [fetchUpdates]);

  const handleDownload = useCallback(async (id: string) => {
    // ownerFetch handles auth; we need to follow redirect to the signed URL.
    // Since Response.redirected is tricky with fetch here, just open via window with auth bridge:
    // Strategy: fetch with Bearer, read Location via 302? Actually fetch follows redirects by default.
    // Simpler: ask the API for the signed URL by fetching as JSON isn't implemented —
    // Use a manual fetch with redirect='manual' to extract the signed URL, then navigate.
    try {
      const token = localStorage.getItem('owner_token');
      const res = await fetch(`/api/agent-updates/${id}/download`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        redirect: 'manual',
      });
      // With redirect:'manual', Fetch returns an opaque response for cross-origin;
      // for same-origin the Location header may be hidden. Fall back to following redirect:
      if (res.type === 'opaqueredirect') {
        // Just trigger a regular navigation with an authenticated fetch then window.open
        // the signed URL is only accessible via the redirect, so let browser follow:
        window.location.href = `/api/agent-updates/${id}/download`;
        return;
      }
      const location = res.headers.get('Location');
      if (location) {
        window.location.href = location;
      } else {
        // Browser followed redirect; url is the signed URL
        window.location.href = res.url;
      }
    } catch {
      window.location.href = `/api/agent-updates/${id}/download`;
    }
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#1e1b4b' }}>
        Agent Updates
      </h1>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Publish agent installer packages. Tenant administrators can then deploy these versions to their enrolled agents.
      </p>

      {/* Upload */}
      <section
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#111827' }}>
          Upload New Package
        </h2>
        <form onSubmit={(e) => void handleUpload(e)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="upload-version" style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                Version (auto-detected if blank)
              </label>
              <input
                id="upload-version"
                type="text"
                value={uploadVersion}
                onChange={(e) => setUploadVersion(e.target.value)}
                placeholder="Detected from file"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label htmlFor="upload-platform" style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                Platform
              </label>
              <select
                id="upload-platform"
                value={uploadPlatform}
                onChange={(e) => setUploadPlatform(e.target.value as Platform)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                }}
              >
                <option value="WINDOWS">Windows</option>
                <option value="LINUX">Linux</option>
                <option value="MACOS">macOS</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="upload-file" style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
              Package File (.msi / .exe / .tar.gz / .zip)
            </label>
            <input
              id="upload-file"
              ref={fileInputRef}
              type="file"
              accept=".exe,.msi,.tar.gz,.zip"
              style={{ fontSize: 13 }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="upload-notes" style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
              Release Notes (optional)
            </label>
            <textarea
              id="upload-notes"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={3}
              placeholder="What's new in this version?"
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 13,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {uploadError && (
            <div style={{ padding: '8px 12px', marginBottom: 10, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13 }}>
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div style={{ padding: '8px 12px', marginBottom: 10, backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 13 }}>
              {uploadSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            style={{
              padding: '9px 20px',
              backgroundColor: uploading ? '#a5b4fc' : '#4338ca',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Uploading...' : 'Upload Package'}
          </button>
        </form>
      </section>

      {/* List */}
      <section
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
            Published Packages ({updates.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 20, color: '#b91c1c' }}>{error}</div>
        ) : updates.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            No agent packages published yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Version</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Platform</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Size</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Uploaded</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Release Notes</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {updates.map((u) => {
                const isConfirming = confirmDeleteId === u.id;
                return (
                  <tr key={u.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>v{u.version}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{PLATFORM_LABELS[u.platform]}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{formatBytes(u.fileSize)}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.releaseNotes ?? ''}>
                      {u.releaseNotes ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      {isConfirming ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            onClick={() => void handleDelete(u.id)}
                            disabled={deleting}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 5,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: deleting ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {deleting ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              padding: '4px 8px',
                              background: 'none',
                              border: 'none',
                              color: '#6b7280',
                              fontSize: 12,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => void handleDownload(u.id)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#fff',
                              color: '#4338ca',
                              border: '1px solid #4338ca',
                              borderRadius: 5,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Download
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(u.id)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: '#fff',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              borderRadius: 5,
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
