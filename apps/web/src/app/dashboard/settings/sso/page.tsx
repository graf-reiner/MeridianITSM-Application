'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiShieldKey, mdiPlus, mdiPencil, mdiTrashCan, mdiToggleSwitch, mdiToggleSwitchOff } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SsoConnection {
  id: string;
  name: string;
  protocol: string;
  status: string;
  oidcClientId: string | null;
  oidcIssuerUrl: string | null;
  oidcDiscoveryUrl: string | null;
  samlMetadataUrl: string | null;
  samlEntityId: string | null;
  autoProvision: boolean;
  defaultRole: string;
  forceMfa: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── SSO Modal ────────────────────────────────────────────────────────────────

function SsoModal({
  connection,
  onClose,
  onSaved,
}: {
  connection: SsoConnection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!connection;
  const [name, setName] = useState(connection?.name ?? '');
  const [protocol, setProtocol] = useState(connection?.protocol ?? 'oidc');
  const [status, setStatus] = useState(connection?.status ?? 'active');
  const [oidcClientId, setOidcClientId] = useState(connection?.oidcClientId ?? '');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcIssuerUrl, setOidcIssuerUrl] = useState(connection?.oidcIssuerUrl ?? '');
  const [oidcDiscoveryUrl, setOidcDiscoveryUrl] = useState(connection?.oidcDiscoveryUrl ?? '');
  const [samlMetadataUrl, setSamlMetadataUrl] = useState(connection?.samlMetadataUrl ?? '');
  const [samlMetadataRaw, setSamlMetadataRaw] = useState('');
  const [autoProvision, setAutoProvision] = useState(connection?.autoProvision ?? true);
  const [defaultRole, setDefaultRole] = useState(connection?.defaultRole ?? 'agent');
  const [forceMfa, setForceMfa] = useState(connection?.forceMfa ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        status,
        autoProvision,
        defaultRole: defaultRole.trim() || 'agent',
        forceMfa,
      };

      if (!isEdit) {
        body.protocol = protocol;
      }

      if (protocol === 'oidc') {
        body.oidcClientId = oidcClientId;
        if (oidcClientSecret) body.oidcClientSecret = oidcClientSecret;
        body.oidcIssuerUrl = oidcIssuerUrl;
        body.oidcDiscoveryUrl = oidcDiscoveryUrl;
      } else {
        body.samlMetadataUrl = samlMetadataUrl;
        if (samlMetadataRaw) body.samlMetadataRaw = samlMetadataRaw;
      }

      const url = isEdit
        ? `/api/v1/settings/sso/${connection.id}`
        : '/api/v1/settings/sso';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save SSO connection');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SSO connection');
    } finally {
      setIsSaving(false);
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
  const labelStyle = {
    display: 'block',
    marginBottom: 4,
    fontSize: 13,
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
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
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          overflow: 'auto',
          maxHeight: '90vh',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {isEdit ? 'Edit SSO Connection' : 'Create SSO Connection'}
          </h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="sso-name" style={labelStyle}>
              Name *
            </label>
            <input
              id="sso-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Protocol */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="sso-protocol" style={labelStyle}>
              Protocol *
            </label>
            <select
              id="sso-protocol"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              disabled={isEdit}
              style={{ ...inputStyle, backgroundColor: isEdit ? 'var(--bg-tertiary)' : 'var(--bg-primary)' }}
            >
              <option value="oidc">OIDC</option>
              <option value="saml">SAML</option>
            </select>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="sso-status" style={labelStyle}>
              Status
            </label>
            <select
              id="sso-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {/* OIDC fields */}
          {protocol === 'oidc' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="sso-oidc-client-id" style={labelStyle}>
                  Client ID
                </label>
                <input
                  id="sso-oidc-client-id"
                  type="text"
                  value={oidcClientId}
                  onChange={(e) => setOidcClientId(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="sso-oidc-client-secret" style={labelStyle}>
                  Client Secret
                </label>
                <input
                  id="sso-oidc-client-secret"
                  type="password"
                  value={oidcClientSecret}
                  onChange={(e) => setOidcClientSecret(e.target.value)}
                  placeholder={isEdit ? '(unchanged if left blank)' : ''}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="sso-oidc-issuer" style={labelStyle}>
                  Issuer URL
                </label>
                <input
                  id="sso-oidc-issuer"
                  type="text"
                  value={oidcIssuerUrl}
                  onChange={(e) => setOidcIssuerUrl(e.target.value)}
                  placeholder="https://accounts.google.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="sso-oidc-discovery" style={labelStyle}>
                  Discovery URL
                </label>
                <input
                  id="sso-oidc-discovery"
                  type="text"
                  value={oidcDiscoveryUrl}
                  onChange={(e) => setOidcDiscoveryUrl(e.target.value)}
                  placeholder="https://.../.well-known/openid-configuration"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {/* SAML fields */}
          {protocol === 'saml' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="sso-saml-metadata-url" style={labelStyle}>
                  Metadata URL
                </label>
                <input
                  id="sso-saml-metadata-url"
                  type="text"
                  value={samlMetadataUrl}
                  onChange={(e) => setSamlMetadataUrl(e.target.value)}
                  placeholder="https://idp.example.com/metadata"
                  style={inputStyle}
                />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>
                  Provide a Metadata URL or paste raw XML below
                </p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="sso-saml-metadata-xml" style={labelStyle}>
                  Metadata XML
                </label>
                <textarea
                  id="sso-saml-metadata-xml"
                  value={samlMetadataRaw}
                  onChange={(e) => setSamlMetadataRaw(e.target.value)}
                  placeholder="<EntityDescriptor ...>"
                  rows={5}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}
                />
              </div>
            </>
          )}

          {/* Provisioning */}
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
                checked={autoProvision}
                onChange={(e) => setAutoProvision(e.target.checked)}
              />
              <span>Auto-provision users</span>
            </label>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="sso-default-role" style={labelStyle}>
              Default role for provisioned users
            </label>
            <input
              id="sso-default-role"
              type="text"
              value={defaultRole}
              onChange={(e) => setDefaultRole(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
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
                checked={forceMfa}
                onChange={(e) => setForceMfa(e.target.checked)}
              />
              <span>Force MFA after SSO login</span>
            </label>
          </div>

          {error && (
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
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '8px 18px',
                backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SSO Settings Page ────────────────────────────────────────────────────────

export default function SsoSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editConnection, setEditConnection] = useState<SsoConnection | null>(null);

  const { data, isLoading } = useQuery<SsoConnection[]>({
    queryKey: ['settings-sso'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/sso', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load SSO connections');
      const json = await res.json();
      return Array.isArray(json) ? json : json.connections ?? [];
    },
  });

  const handleDelete = async (conn: SsoConnection) => {
    if (!window.confirm(`Delete SSO connection "${conn.name}"?`)) return;
    await fetch(`/api/v1/settings/sso/${conn.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    void qc.invalidateQueries({ queryKey: ['settings-sso'] });
  };

  const handleToggleStatus = async (conn: SsoConnection) => {
    const newStatus = conn.status === 'active' ? 'disabled' : 'active';
    await fetch(`/api/v1/settings/sso/${conn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus }),
    });
    void qc.invalidateQueries({ queryKey: ['settings-sso'] });
  };

  const connections = data ?? [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
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
          <Icon path={mdiShieldKey} size={1} color="#0891b2" />
          SSO Configuration
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => {
              setEditConnection(null);
              setShowModal(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Connection
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading SSO connections...
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--border-primary)',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Protocol
                </th>
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Created
                </th>
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {connections.map((conn) => (
                <tr key={conn.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{conn.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor:
                          conn.protocol === 'oidc' ? 'var(--badge-blue-bg)' : 'var(--badge-purple-bg)',
                        color: conn.protocol === 'oidc' ? '#1e40af' : '#5b21b6',
                        textTransform: 'uppercase',
                      }}
                    >
                      {conn.protocol}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor:
                          conn.status === 'active' ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)',
                        color: conn.status === 'active' ? '#065f46' : 'var(--text-muted)',
                      }}
                    >
                      {conn.status === 'active' ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                    {new Date(conn.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          setEditConnection(conn);
                          setShowModal(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleToggleStatus(conn)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor: 'var(--bg-primary)',
                          color: conn.status === 'active' ? 'var(--accent-warning)' : 'var(--accent-success)',
                        }}
                      >
                        <Icon
                          path={
                            conn.status === 'active'
                              ? mdiToggleSwitchOff
                              : mdiToggleSwitch
                          }
                          size={0.65}
                          color="currentColor"
                        />
                        {conn.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => void handleDelete(conn)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--accent-danger)',
                        }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {connections.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}
                  >
                    No SSO connections configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <SsoModal
          connection={editConnection}
          onClose={() => setShowModal(false)}
          onSaved={() =>
            void qc.invalidateQueries({ queryKey: ['settings-sso'] })
          }
        />
      )}
    </div>
  );
}
