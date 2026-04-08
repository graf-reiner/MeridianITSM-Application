'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiWeb } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalAccessSettings {
  allowPublicPortal: boolean;
  publicPortalFeatures: string[];
  subdomain: string | null;
}

const FEATURE_OPTIONS = [
  {
    key: 'knowledge_base',
    label: 'Knowledge Base',
    description: 'Browse and read knowledge articles',
  },
  {
    key: 'service_forms',
    label: 'Service Forms',
    description: 'Submit forms marked as public (requireAuth=false)',
  },
  {
    key: 'ticket_lookup',
    label: 'Ticket Lookup',
    description: 'Check ticket status by ticket number and email',
  },
];

// ─── Portal Access Settings Page ──────────────────────────────────────────────

export default function PortalAccessSettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PortalAccessSettings>({
    queryKey: ['settings-portal-access'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/portal-access', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load portal access settings');
      return res.json() as Promise<PortalAccessSettings>;
    },
  });

  // Form state
  const [allowPublicPortal, setAllowPublicPortal] = useState(false);
  const [publicPortalFeatures, setPublicPortalFeatures] = useState<string[]>([]);

  // Populate form when data loads
  useEffect(() => {
    if (data) {
      setAllowPublicPortal(data.allowPublicPortal);
      setPublicPortalFeatures(data.publicPortalFeatures);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/v1/settings/portal-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        throw new Error(errData.error ?? 'Failed to save portal access settings');
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings-portal-access'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      allowPublicPortal,
      publicPortalFeatures,
    });
  };

  const toggleFeature = (feature: string) => {
    setPublicPortalFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature],
    );
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
          Loading portal access settings...
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
          marginBottom: 4,
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
          <Icon path={mdiWeb} size={1} color="#0891b2" />
          Portal Access
        </h1>
      </div>
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14 }}>
        Control public access to your self-service portal
      </p>

      <form onSubmit={handleSubmit}>
        {/* ── Allow Public Portal ──────────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Public Portal Access</h2>

          <div style={{ marginBottom: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={allowPublicPortal}
                onChange={(e) => setAllowPublicPortal(e.target.checked)}
              />
              <span>Allow Public Portal</span>
            </label>
          </div>
          <p
            style={{
              margin: '0 0 0 26px',
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            {allowPublicPortal
              ? 'Public portal is enabled. Unauthenticated users can access selected features.'
              : 'Portal requires authentication. Users must log in to access the self-service portal.'}
          </p>
        </div>

        {/* ── Public Features ─────────────────────────────────────── */}
        {allowPublicPortal && (
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Public Features</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
              Select which features are available to unauthenticated users.
            </p>

            {FEATURE_OPTIONS.map((feature) => (
              <div key={feature.key} style={{ marginBottom: 12 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={publicPortalFeatures.includes(feature.key)}
                    onChange={() => toggleFeature(feature.key)}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <span style={{ fontWeight: 600 }}>{feature.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}> — {feature.description}</span>
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}

        {/* ── Public Portal URL ───────────────────────────────────── */}
        {allowPublicPortal && (
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Public Portal URL</h2>
            {data?.subdomain ? (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 7,
                  fontSize: 14,
                  fontFamily: 'monospace',
                  color: 'var(--text-primary)',
                }}
              >
                https://{data.subdomain}.meridianitsm.com/portal
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                Set a subdomain in the Owner Admin to enable subdomain-based public access.
              </p>
            )}
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
