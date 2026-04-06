'use client';

import { useState, useCallback, useRef } from 'react';
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
  status: string;
  displayStatus?: string;
  lastHeartbeatAt: string | null;
  agentVersion: string | null;
}

interface AgentListResponse {
  agents: Agent[];
}

interface EnrollmentToken {
  id: string;
  prefix: string;
  enrollCount: number;
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

function AgentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    ACTIVE:       { bg: 'var(--badge-green-bg)',  text: '#065f46', label: 'Online' },
    ONLINE:       { bg: 'var(--badge-green-bg)',  text: '#065f46', label: 'Online' },
    OFFLINE:      { bg: 'var(--bg-tertiary)',      text: '#6b7280', label: 'Offline' },
    STALE:        { bg: 'var(--badge-yellow-bg)', text: '#92400e', label: 'Stale — not seen in 24h' },
    DEREGISTERED: { bg: 'var(--badge-red-bg)',    text: '#991b1b', label: 'Deregistered' },
  };
  const s = styles[status] ?? { bg: 'var(--bg-tertiary)', text: '#6b7280', label: status };
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
    border: '1px solid var(--border-secondary)',
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
          maxWidth: 500,
          overflow: 'auto',
          maxHeight: '90vh',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
            Generate Enrollment Token
          </h2>
        </div>

        {!generated ? (
          <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="expiryDate" style={labelStyle}>Expiry Date (optional)</label>
              <input
                id="expiryDate"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Leave blank for no expiry.
              </p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="maxEnrollments" style={labelStyle}>Max Enrollments (optional)</label>
              <input
                id="maxEnrollments"
                type="number"
                min={1}
                value={maxEnrollments}
                onChange={(e) => setMaxEnrollments(e.target.value)}
                placeholder="Unlimited"
                style={inputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Leave blank for unlimited enrollments.
              </p>
            </div>
            {error && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--badge-red-bg-subtle)',
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
                  border: '1px solid var(--border-secondary)',
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
                disabled={isSubmitting}
                style={{
                  padding: '8px 18px',
                  backgroundColor: isSubmitting ? '#a5b4fc' : 'var(--accent-primary)',
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
                backgroundColor: 'var(--badge-green-bg-subtle)',
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
              <label htmlFor="enrollmentToken" style={labelStyle}>Enrollment Token</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="enrollmentToken"
                  type="text"
                  readOnly
                  value={generated.token}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    backgroundColor: 'var(--badge-yellow-bg)',
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
                    backgroundColor: copied ? '#059669' : 'var(--accent-primary)',
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
                <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  QR Code for Agent Enrollment
                </p>
                <img
                  src={qrDataUrl}
                  alt="QR code for agent enrollment"
                  style={{ border: '1px solid var(--border-primary)', borderRadius: 8, padding: 4 }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Scan with the MeridianITSM mobile app to enroll an agent.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 18px',
                  backgroundColor: 'var(--accent-primary)',
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
  const [updatePolicy, setUpdatePolicy] = useState('manual');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadPlatform, setUploadPlatform] = useState('WINDOWS');
  const [uploading, setUploading] = useState(false);
  const [deployConfirm, setDeployConfirm] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!token.isActive) return { label: 'Revoked', bg: 'var(--badge-red-bg)', text: '#991b1b' };
    if (token.expiresAt && new Date(token.expiresAt) < new Date())
      return { label: 'Expired', bg: 'var(--bg-tertiary)', text: '#6b7280' };
    return { label: 'Active', bg: 'var(--badge-green-bg)', text: '#065f46' };
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
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
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
              backgroundColor: 'var(--accent-primary)',
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
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14 }}>
        Manage enrolled inventory agents and enrollment tokens.
      </p>

      {/* Enrollment Tokens Section */}
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
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
            backgroundColor: 'var(--bg-secondary)',
            border: 'none',
            borderBottom: showTokens ? '1px solid var(--border-primary)' : 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon path={mdiQrcode} size={0.85} color="#4f46e5" />
            Enrollment Tokens
            <span
              style={{
                marginLeft: 4,
                padding: '1px 7px',
                backgroundColor: 'var(--badge-indigo-bg)',
                color: '#4f46e5',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {tokens.length}
            </span>
          </span>
          <Icon path={showTokens ? mdiChevronUp : mdiChevronDown} size={0.8} color="var(--text-muted)" />
        </button>

        {showTokens && (
          <>
            {tokensLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading tokens...
              </div>
            ) : tokens.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-placeholder)' }}>
                No enrollment tokens yet. Click &quot;Generate Enrollment Token&quot; to create one.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Token Prefix</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Enrollments</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Created</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Expires</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => {
                    const status = getTokenStatus(token);
                    const isConfirmingRevoke = confirmRevokeId === token.id;
                    return (
                      <tr key={token.id} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 13 }}>
                          {token.prefix}...
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                          {token.enrollCount} /{' '}
                          {token.maxEnrollments != null && token.maxEnrollments >= 0 ? token.maxEnrollments : '∞'}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                          {formatDate(token.createdAt)}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
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
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
                                  color: 'var(--text-muted)',
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
                                  backgroundColor: 'var(--bg-primary)',
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
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {agentsLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading agents...
          </div>
        ) : agents.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ marginBottom: 12 }}>
              <Icon path={mdiDesktopClassic} size={2.5} color="var(--border-secondary)" />
            </div>
            <h3
              style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}
            >
              No agents enrolled
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
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
                backgroundColor: 'var(--accent-primary)',
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
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Hostname</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Platform</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Last Heartbeat</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Agent Version</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const isConfirmingDelete = confirmDeleteId === agent.id;
                return (
                  <tr key={agent.id} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link
                        href={`/dashboard/settings/agents/${agent.id}`}
                        style={{
                          color: 'var(--accent-primary)',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {agent.hostname}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{agent.platform}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <AgentStatusBadge status={agent.displayStatus ?? agent.status} />
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                      {formatDate(agent.lastHeartbeatAt)}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                      {agent.agentVersion ?? '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {isConfirmingDelete ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
                              color: 'var(--text-muted)',
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
                            backgroundColor: 'var(--bg-primary)',
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

      {/* Agent Updates Section */}
      <div
        style={{
          marginTop: 32,
          backgroundColor: 'var(--bg-primary)',
          borderRadius: 12,
          border: '1px solid var(--border-primary)',
          padding: 24,
        }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>
          Agent Updates
        </h2>

        {/* Update Policy */}
        <div style={{ marginBottom: 24 }}>
          <label
            htmlFor="updatePolicy"
            style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}
          >
            Update Policy
          </label>
          <select
            id="updatePolicy"
            value={updatePolicy}
            onChange={async (e) => {
              const newPolicy = e.target.value;
              setUpdatePolicy(newPolicy);
              try {
                await fetch('/api/v1/settings/agent-update-policy', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ policy: newPolicy }),
                });
              } catch {
                // revert on failure could be added later
              }
            }}
            style={{
              width: '100%',
              maxWidth: 440,
              padding: '8px 10px',
              border: '1px solid var(--border-secondary)',
              borderRadius: 7,
              fontSize: 14,
              outline: 'none',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="manual">Manual — admin must push updates</option>
            <option value="automatic">Automatic — agents update on next heartbeat</option>
            <option value="scheduled">Scheduled — updates during maintenance window only</option>
          </select>
        </div>

        {/* Upload Update Package */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}
          >
            Upload Update Package
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label
                htmlFor="uploadVersion"
                style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}
              >
                Version
              </label>
              <input
                id="uploadVersion"
                type="text"
                placeholder="e.g. 1.2.0"
                value={uploadVersion}
                onChange={(e) => setUploadVersion(e.target.value)}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 7,
                  fontSize: 14,
                  outline: 'none',
                  width: 140,
                }}
              />
            </div>
            <div>
              <label
                htmlFor="uploadPlatform"
                style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}
              >
                Platform
              </label>
              <select
                id="uploadPlatform"
                value={uploadPlatform}
                onChange={(e) => setUploadPlatform(e.target.value)}
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 7,
                  fontSize: 14,
                  outline: 'none',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  width: 140,
                }}
              >
                <option value="WINDOWS">Windows</option>
                <option value="LINUX">Linux</option>
                <option value="MACOS">macOS</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="uploadFile"
                style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}
              >
                Package File
              </label>
              <input
                id="uploadFile"
                ref={fileInputRef}
                type="file"
                accept=".exe,.msi,.tar.gz,.zip"
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              />
            </div>
            <button
              disabled={uploading}
              onClick={async () => {
                const file = fileInputRef.current?.files?.[0];
                if (!file) { setUploadError('Please select a file.'); return; }
                if (!uploadVersion.trim()) { setUploadError('Please enter a version.'); return; }
                setUploading(true);
                setUploadError(null);
                setUploadSuccess(null);
                try {
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('version', uploadVersion.trim());
                  formData.append('platform', uploadPlatform);
                  const res = await fetch('/api/v1/agents/updates/upload', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData,
                  });
                  if (!res.ok) {
                    const data = (await res.json()) as { error?: string };
                    throw new Error(data.error ?? 'Upload failed');
                  }
                  setUploadSuccess(`Package v${uploadVersion.trim()} (${uploadPlatform}) uploaded successfully.`);
                  setUploadVersion('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : 'Upload failed');
                } finally {
                  setUploading(false);
                }
              }}
              style={{
                padding: '8px 18px',
                backgroundColor: uploading ? '#a5b4fc' : 'var(--accent-brand, #0284c7)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
          {uploadError && (
            <div style={{ marginTop: 8, padding: '6px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div style={{ marginTop: 8, padding: '6px 12px', backgroundColor: 'var(--badge-green-bg-subtle)', border: '1px solid #86efac', borderRadius: 7, color: '#166534', fontSize: 13 }}>
              {uploadSuccess}
            </div>
          )}
        </div>

        {/* Deploy Update */}
        <div>
          <label
            style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}
          >
            Deploy Update
          </label>
          {!deployConfirm ? (
            <button
              onClick={() => setDeployConfirm(true)}
              style={{
                padding: '8px 18px',
                backgroundColor: 'var(--accent-warning, #f59e0b)',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Deploy Update to All Agents
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Deploy the latest update to all agents? This cannot be undone.
              </span>
              <button
                disabled={deploying}
                onClick={async () => {
                  setDeploying(true);
                  setDeployResult(null);
                  try {
                    const res = await fetch('/api/v1/agents/updates/deploy', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ agentIds: 'all', version: 'latest', platform: 'WINDOWS' }),
                    });
                    if (!res.ok) {
                      const data = (await res.json()) as { error?: string };
                      throw new Error(data.error ?? 'Deploy failed');
                    }
                    const data = (await res.json()) as { targeted?: number };
                    setDeployResult(`Update deployed — ${data.targeted ?? 0} agent(s) targeted.`);
                  } catch (err) {
                    setDeployResult(err instanceof Error ? err.message : 'Deploy failed');
                  } finally {
                    setDeploying(false);
                    setDeployConfirm(false);
                  }
                }}
                style={{
                  padding: '6px 14px',
                  backgroundColor: deploying ? '#a5b4fc' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deploying ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {deploying ? 'Deploying...' : 'Confirm Deploy'}
              </button>
              <button
                onClick={() => setDeployConfirm(false)}
                style={{
                  padding: '6px 10px',
                  border: 'none',
                  background: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {deployResult && (
            <div style={{ marginTop: 8, padding: '6px 12px', backgroundColor: 'var(--badge-green-bg-subtle)', border: '1px solid #86efac', borderRadius: 7, color: '#166534', fontSize: 13 }}>
              {deployResult}
            </div>
          )}
        </div>
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
