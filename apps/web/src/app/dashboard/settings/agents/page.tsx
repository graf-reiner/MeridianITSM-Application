'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiDesktopClassic,
  mdiPlus,
  mdiContentCopy,
  mdiChevronDown,
  mdiChevronUp,
  mdiQrcode,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  hostname: string;
  platform: string;
  status: 'ONLINE' | 'OFFLINE' | 'STALE';
  lastHeartbeatAt: string | null;
  agentVersion: string | null;
}

interface AgentListResponse {
  agents: Agent[];
}

interface EnrollmentToken {
  id: string;
  prefix: string;
  enrollmentCount: number;
  maxEnrollments: number | null;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface TokenListResponse {
  tokens: EnrollmentToken[];
}

interface GeneratedToken {
  id: string;
  token: string;
  prefix: string;
}

// ─── Agent Status Badge ───────────────────────────────────────────────────────

function AgentStatusBadge({ status }: { status: Agent['status'] }) {
  const styles: Record<Agent['status'], { bg: string; text: string; label: string }> = {
    ONLINE: { bg: '#d1fae5', text: '#065f46', label: 'Online' },
    OFFLINE: { bg: '#f3f4f6', text: '#6b7280', label: 'Offline' },
    STALE: { bg: '#fef3c7', text: '#92400e', label: 'Stale — not seen in 24h' },
  };
  const s = styles[status];
  return (
    <span
      title={status === 'STALE' ? 'Not seen in 24h' : undefined}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: s.bg,
        color: s.text,
        cursor: status === 'STALE' ? 'help' : 'default',
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Generate Token Modal ─────────────────────────────────────────────────────

function GenerateTokenModal({
  serverUrl,
  onClose,
  onGenerated,
}: {
  serverUrl: string;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [expiresAt, setExpiresAt] = useState('');
  const [maxEnrollments, setMaxEnrollments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedToken | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (expiresAt) body.expiresAt = expiresAt;
      if (maxEnrollments) body.maxEnrollments = parseInt(maxEnrollments, 10);

      const res = await fetch('/api/v1/settings/agents/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to generate token');
      }

      const data = (await res.json()) as GeneratedToken;
      setGenerated(data);

      // Generate QR code client-side
      try {
        const QRCode = (await import('qrcode')).default;
        const payload = JSON.stringify({ serverUrl, token: data.token });
        const dataUrl = await QRCode.toDataURL(payload, { width: 200, margin: 2 });
        setQrDataUrl(dataUrl);
      } catch {
        // QR generation failure is non-critical
      }

      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate token');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (generated?.token) {
      await navigator.clipboard.writeText(generated.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          maxWidth: 500,
          overflow: 'auto',
          maxHeight: '90vh',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>
            Generate Enrollment Token
          </h2>
        </div>

        {!generated ? (
          <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Expiry Date (optional)</label>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                Leave blank for no expiry.
              </p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Max Enrollments (optional)</label>
              <input
                type="number"
                min={1}
                value={maxEnrollments}
                onChange={(e) => setMaxEnrollments(e.target.value)}
                placeholder="Unlimited"
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                Leave blank for unlimited enrollments.
              </p>
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
                disabled={isSubmitting}
                style={{
                  padding: '8px 18px',
                  backgroundColor: isSubmitting ? '#a5b4fc' : '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Generating...' : 'Generate Token'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{ padding: 24 }}>
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: 8,
                marginBottom: 16,
                color: '#166534',
                fontSize: 13,
              }}
            >
              Token generated. Copy it now — it will not be shown again.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Enrollment Token</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={generated.token}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    backgroundColor: '#fef3c7',
                    border: '2px solid #f59e0b',
                    fontFamily: 'monospace',
                    fontSize: 13,
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

            {qrDataUrl && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', fontWeight: 600 }}>
                  QR Code for Agent Enrollment
                </p>
                <img
                  src={qrDataUrl}
                  alt="QR code for agent enrollment"
                  style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 4 }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Scan with the MeridianITSM mobile app to enroll an agent.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agents Page ──────────────────────────────────────────────────────────────

export default function AgentsSettingsPage() {
  const qc = useQueryClient();
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showTokens, setShowTokens] = useState(true);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: agentsData, isLoading: agentsLoading } = useQuery<AgentListResponse>({
    queryKey: ['settings-agents'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/agents', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load agents');
      return res.json() as Promise<AgentListResponse>;
    },
  });

  const { data: tokensData, isLoading: tokensLoading } = useQuery<TokenListResponse>({
    queryKey: ['settings-agent-tokens'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/agents/tokens', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tokens');
      return res.json() as Promise<TokenListResponse>;
    },
  });

  const handleRevokeToken = useCallback(
    async (id: string) => {
      setRevoking(true);
      try {
        await fetch(`/api/v1/settings/agents/tokens/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        void qc.invalidateQueries({ queryKey: ['settings-agent-tokens'] });
      } finally {
        setRevoking(false);
        setConfirmRevokeId(null);
      }
    },
    [qc],
  );

  const handleDeleteAgent = useCallback(
    async (id: string) => {
      setDeleting(true);
      try {
        await fetch(`/api/v1/settings/agents/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        void qc.invalidateQueries({ queryKey: ['settings-agents'] });
      } finally {
        setDeleting(false);
        setConfirmDeleteId(null);
      }
    },
    [qc],
  );

  const agents = agentsData?.agents ?? [];
  const tokens = tokensData?.tokens ?? [];

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleString();
  };

  const getTokenStatus = (token: EnrollmentToken): { label: string; bg: string; text: string } => {
    if (!token.isActive) return { label: 'Revoked', bg: '#fee2e2', text: '#991b1b' };
    if (token.expiresAt && new Date(token.expiresAt) < new Date())
      return { label: 'Expired', bg: '#f3f4f6', text: '#6b7280' };
    return { label: 'Active', bg: '#d1fae5', text: '#065f46' };
  };

  const serverUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-server.example.com';

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
          <Icon path={mdiDesktopClassic} size={1} color="#4f46e5" />
          Agents
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowGenerateModal(true)}
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
            Generate Enrollment Token
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>
        Manage enrolled inventory agents and enrollment tokens.
      </p>

      {/* Enrollment Tokens Section */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          marginBottom: 24,
          overflow: 'hidden',
        }}
      >
        <button
          onClick={() => setShowTokens((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
            border: 'none',
            borderBottom: showTokens ? '1px solid #e5e7eb' : 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            color: '#374151',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiQrcode} size={0.85} color="#4f46e5" />
            Enrollment Tokens
            <span
              style={{
                marginLeft: 4,
                padding: '1px 7px',
                backgroundColor: '#e0e7ff',
                color: '#4f46e5',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {tokens.length}
            </span>
          </span>
          <Icon path={showTokens ? mdiChevronUp : mdiChevronDown} size={0.8} color="#6b7280" />
        </button>

        {showTokens && (
          <>
            {tokensLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                Loading tokens...
              </div>
            ) : tokens.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                No enrollment tokens yet. Click &quot;Generate Enrollment Token&quot; to create one.
              </div>
            ) : (
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
                      Token Prefix
                    </th>
                    <th
                      style={{
                        padding: '8px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Enrollments
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
                      Expires
                    </th>
                    <th
                      style={{
                        padding: '8px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Status
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
                  {tokens.map((token) => {
                    const status = getTokenStatus(token);
                    const isConfirmingRevoke = confirmRevokeId === token.id;
                    return (
                      <tr key={token.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 13 }}>
                          {token.prefix}...
                        </td>
                        <td style={{ padding: '10px 16px', color: '#374151' }}>
                          {token.enrollmentCount} /{' '}
                          {token.maxEnrollments !== null ? token.maxEnrollments : '∞'}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                          {formatDate(token.createdAt)}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                          {formatDate(token.expiresAt)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 9999,
                              fontSize: 12,
                              fontWeight: 500,
                              backgroundColor: status.bg,
                              color: status.text,
                            }}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {isConfirmingRevoke ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: '#374151' }}>
                                Revoke token? This token will immediately stop accepting new
                                enrollments. Existing enrolled agents are not affected.
                              </span>
                              <button
                                onClick={() => void handleRevokeToken(token.id)}
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
                            token.isActive && (
                              <button
                                onClick={() => setConfirmRevokeId(token.id)}
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
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Agents Table */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {agentsLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Loading agents...
          </div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>
              <Icon path={mdiDesktopClassic} size={2.5} color="#d1d5db" />
            </div>
            <h3
              style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#374151' }}
            >
              No agents enrolled
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#6b7280', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
              Generate an enrollment token and run the agent installer on your endpoints. The agent
              will appear here after first check-in.
            </p>
            <button
              onClick={() => setShowGenerateModal(true)}
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
              Generate Enrollment Token
            </button>
          </div>
        ) : (
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
                  Hostname
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Platform
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Last Heartbeat
                </th>
                <th
                  style={{
                    padding: '8px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#374151',
                  }}
                >
                  Agent Version
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
              {agents.map((agent) => {
                const isConfirmingDelete = confirmDeleteId === agent.id;
                return (
                  <tr key={agent.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link
                        href={`/dashboard/settings/agents/${agent.id}`}
                        style={{
                          color: '#4f46e5',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {agent.hostname}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{agent.platform}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <AgentStatusBadge status={agent.status} />
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                      {formatDate(agent.lastHeartbeatAt)}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>
                      {agent.agentVersion ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#374151' }}>
                            Remove agent? This removes the agent record and its inventory history.
                          </span>
                          <button
                            onClick={() => void handleDeleteAgent(agent.id)}
                            disabled={deleting}
                            style={{
                              padding: '3px 10px',
                              backgroundColor: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: deleting ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {deleting ? 'Removing...' : 'Confirm Remove'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
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
                          onClick={() => setConfirmDeleteId(agent.id)}
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
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate Token Modal */}
      {showGenerateModal && (
        <GenerateTokenModal
          serverUrl={serverUrl}
          onClose={() => setShowGenerateModal(false)}
          onGenerated={() => void qc.invalidateQueries({ queryKey: ['settings-agent-tokens'] })}
        />
      )}
    </div>
  );
}
