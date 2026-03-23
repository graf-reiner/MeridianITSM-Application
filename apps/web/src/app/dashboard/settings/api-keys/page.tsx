'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiKeyVariant, mdiPlus, mdiContentCopy, mdiClose } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

const SCOPES = ['tickets.read', 'tickets.write', 'assets.read', 'ci.read'] as const;
type Scope = (typeof SCOPES)[number];

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  rateLimit: number | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiKeyListResponse {
  apiKeys: ApiKey[];
}

interface CreatedApiKey {
  id: string;
  key: string;
  prefix: string;
}

// ─── Create API Key Modal ──────────────────────────────────────────────────────

function CreateApiKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(['tickets.read']));
  const [rateLimit, setRateLimit] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScope = (scope: Scope) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        scopes: Array.from(scopes),
      };
      if (rateLimit) body.rateLimit = parseInt(rateLimit, 10);

      const res = await fetch('/api/v1/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create API key');
      }

      const data = (await res.json()) as CreatedApiKey;
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setIsSubmitting(false);
    }
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
  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 480,
          overflow: 'auto',
          maxHeight: '90vh',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
            Create API Key
          </h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: 4,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            <Icon path={mdiClose} size={0.9} color="currentColor" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Zapier integration"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Scopes</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SCOPES.map((scope) => (
                <label
                  key={scope}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 14,
                    color: '#374151',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={scopes.has(scope)}
                    onChange={() => toggleScope(scope)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 13,
                      backgroundColor: '#f3f4f6',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {scope}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Rate Limit Override (requests/min, optional)</label>
            <input
              type="number"
              min={1}
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              placeholder="Default: 100/min"
              style={inputStyle}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 7,
                marginBottom: 14,
                color: '#dc2626',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: 7,
                fontSize: 14,
                cursor: 'pointer',
                backgroundColor: '#fff',
                color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || scopes.size === 0}
              style={{
                padding: '8px 18px',
                backgroundColor: isSubmitting || scopes.size === 0 ? '#a5b4fc' : '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSubmitting || scopes.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Key Created Banner ────────────────────────────────────────────────────────

function KeyCreatedBanner({
  apiKey,
  onDismiss,
}: {
  apiKey: CreatedApiKey;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        backgroundColor: '#fef3c7',
        border: '2px solid #f59e0b',
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#92400e' }}>
          API key created. Copy it now — it will not be shown again.
        </p>
        <button
          onClick={onDismiss}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 4,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#92400e',
          }}
        >
          <Icon path={mdiClose} size={0.8} color="currentColor" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          readOnly
          value={apiKey.key}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: '1px solid #f59e0b',
            borderRadius: 7,
            fontSize: 13,
            fontFamily: 'monospace',
            backgroundColor: '#fffbeb',
            outline: 'none',
          }}
        />
        <button
          onClick={() => void handleCopy()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '8px 14px',
            backgroundColor: copied ? '#059669' : '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon path={mdiContentCopy} size={0.75} color="currentColor" />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ─── API Keys Page ────────────────────────────────────────────────────────────

export default function ApiKeysSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const { data, isLoading } = useQuery<ApiKeyListResponse>({
    queryKey: ['settings-api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/api-keys', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load API keys');
      return res.json() as Promise<ApiKeyListResponse>;
    },
  });

  const handleCreated = useCallback(
    (key: CreatedApiKey) => {
      setShowModal(false);
      setCreatedKey(key);
      void qc.invalidateQueries({ queryKey: ['settings-api-keys'] });
    },
    [qc],
  );

  const handleRevoke = useCallback(
    async (id: string) => {
      setRevoking(true);
      try {
        await fetch(`/api/v1/settings/api-keys/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        void qc.invalidateQueries({ queryKey: ['settings-api-keys'] });
      } finally {
        setRevoking(false);
        setConfirmRevokeId(null);
      }
    },
    [qc],
  );

  const apiKeys = data?.apiKeys ?? [];

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/dashboard/settings"
          style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: '#111827',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon path={mdiKeyVariant} size={1} color="#4f46e5" />
          API Keys
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Create API Key
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Create API keys for external integrations. Keys are shown once on creation.
      </p>

      {/* Created Key Banner */}
      {createdKey && (
        <KeyCreatedBanner apiKey={createdKey} onDismiss={() => setCreatedKey(null)} />
      )}

      {/* Keys Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Loading API keys...
        </div>
      ) : apiKeys.length === 0 && !createdKey ? (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <Icon path={mdiKeyVariant} size={2.5} color="#d1d5db" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#374151' }}>
            No API keys
          </h3>
          <p
            style={{
              margin: '0 0 20px',
              fontSize: 14,
              color: '#6b7280',
              maxWidth: 380,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Create an API key to allow external tools to access tickets, assets, and CIs via the
            REST API.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Create API Key
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Prefix
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Scopes
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Rate Limit
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Last Used
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Created
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((key) => {
                const isConfirmingRevoke = confirmRevokeId === key.id;
                return (
                  <tr key={key.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#111827' }}>
                      {key.name}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <code
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 12,
                          backgroundColor: '#f3f4f6',
                          padding: '2px 6px',
                          borderRadius: 4,
                          color: '#374151',
                        }}
                      >
                        {key.prefix}...
                      </code>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {key.scopes.map((scope) => (
                          <span
                            key={scope}
                            style={{
                              padding: '1px 6px',
                              backgroundColor: '#e0e7ff',
                              color: '#4f46e5',
                              borderRadius: 4,
                              fontSize: 11,
                              fontFamily: 'monospace',
                            }}
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                      {key.rateLimit !== null ? `${key.rateLimit}/min` : '100/min'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                      {formatDate(key.lastUsedAt)}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                      {formatDate(key.createdAt)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {isConfirmingRevoke ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                            Revoke key ending in ...{key.prefix}? Any integrations using this key
                            will stop working immediately.
                          </span>
                          <button
                            onClick={() => void handleRevoke(key.id)}
                            disabled={revoking}
                            style={{
                              padding: '3px 10px',
                              backgroundColor: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: revoking ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {revoking ? 'Revoking...' : 'Confirm Revoke'}
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            style={{
                              padding: '3px 8px',
                              border: 'none',
                              background: 'none',
                              color: '#6b7280',
                              fontSize: 12,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(key.id)}
                          style={{
                            padding: '4px 10px',
                            border: '1px solid #fecaca',
                            borderRadius: 6,
                            fontSize: 12,
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                            color: '#dc2626',
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CreateApiKeyModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
