'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiDesktopClassic, mdiMemory, mdiHarddisk, mdiLan, mdiPackageVariantClosed, mdiChartLine, mdiCloudUpload, mdiFormatListBulleted } from '@mdi/js';

interface Snapshot {
  id: string;
  hostname: string;
  operatingSystem: string | null;
  osVersion: string | null;
  cpuModel: string | null;
  cpuCores: number | null;
  ramGb: number | null;
  disks: unknown;
  networkInterfaces: unknown;
  installedSoftware: unknown;
  collectedAt: string;
}

interface AgentDetail {
  id: string;
  hostname: string;
  platform: string;
  platformVersion: string | null;
  agentVersion: string | null;
  status: string;
  displayStatus: string;
  lastHeartbeatAt: string | null;
  enrolledAt: string | null;
  metadata: unknown;
  inventorySnapshots: Snapshot[];
}

interface MetricSample {
  metricType: string;
  metricName: string;
  value: number;
  unit: string | null;
  timestamp: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    ACTIVE:       { bg: 'var(--badge-green-bg)',  text: '#065f46' },
    ONLINE:       { bg: 'var(--badge-green-bg)',  text: '#065f46' },
    STALE:        { bg: 'var(--badge-yellow-bg)', text: '#92400e' },
    OFFLINE:      { bg: 'var(--bg-tertiary)',      text: '#6b7280' },
    DEREGISTERED: { bg: 'var(--badge-red-bg)',    text: '#991b1b' },
  };
  const s = styles[status] ?? { bg: 'var(--bg-tertiary)', text: '#6b7280' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600, backgroundColor: s.bg, color: s.text }}>
      {status}
    </span>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const queryClient = useQueryClient();
  const [confirmDeregister, setConfirmDeregister] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const { data: agent, isLoading, error } = useQuery<AgentDetail>({
    queryKey: ['agent-detail', agentId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/agents/${agentId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load agent');
      return res.json();
    },
  });

  const { data: metricsData } = useQuery<{ metrics: MetricSample[] }>({
    queryKey: ['agent-metrics', agentId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/agents/${agentId}/metrics?hours=24`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load metrics');
      return res.json();
    },
    enabled: !!agentId,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/v1/settings/agents/${agentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Status update failed');
      }
      return res.json();
    },
    onSuccess: () => {
      setStatusError(null);
      setConfirmDeregister(false);
      queryClient.invalidateQueries({ queryKey: ['agent-detail', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
    onError: (err: Error) => {
      setStatusError(err.message);
    },
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading agent...</div>;
  if (error || !agent) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>Agent not found</div>;

  const snapshot = agent.inventorySnapshots[0];
  const disks = Array.isArray(snapshot?.disks) ? snapshot.disks as Array<Record<string, unknown>> : [];
  const nics = Array.isArray(snapshot?.networkInterfaces) ? snapshot.networkInterfaces as Array<Record<string, unknown>> : [];
  const software = Array.isArray(snapshot?.installedSoftware) ? snapshot.installedSoftware as Array<Record<string, unknown>> : [];

  // Group metrics by metricName, keep latest value per name
  const metrics = metricsData?.metrics ?? [];
  const latestByName = metrics.reduce<Record<string, MetricSample>>((acc, m) => {
    if (!acc[m.metricName] || new Date(m.timestamp) > new Date(acc[m.metricName].timestamp)) {
      acc[m.metricName] = m;
    }
    return acc;
  }, {});
  const metricEntries = Object.values(latestByName);

  const cardStyle = { backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 16 };
  const labelStyle = { fontSize: 12, color: 'var(--text-placeholder)', marginBottom: 2 };
  const valueStyle = { fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 as const };

  const btnBase: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Link href="/dashboard/settings/agents" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <Icon path={mdiDesktopClassic} size={1.1} color="#0891b2" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{agent.hostname}</h1>
        <StatusBadge status={agent.displayStatus} />
      </div>

      {/* Status Action Buttons */}
      {agent.status !== 'DEREGISTERED' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {agent.status === 'ACTIVE' && (
            <button
              style={{ ...btnBase, backgroundColor: '#d97706', color: '#fff' }}
              onClick={() => statusMutation.mutate('SUSPENDED')}
              disabled={statusMutation.isPending}
            >
              Suspend
            </button>
          )}
          {agent.status === 'SUSPENDED' && (
            <button
              style={{ ...btnBase, backgroundColor: '#059669', color: '#fff' }}
              onClick={() => statusMutation.mutate('ACTIVE')}
              disabled={statusMutation.isPending}
            >
              Reactivate
            </button>
          )}
          {!confirmDeregister ? (
            <button
              style={{ ...btnBase, backgroundColor: 'transparent', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)' }}
              onClick={() => setConfirmDeregister(true)}
              disabled={statusMutation.isPending}
            >
              Deregister
            </button>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--accent-danger)' }}>Confirm deregister?</span>
              <button
                style={{ ...btnBase, backgroundColor: 'var(--accent-danger)', color: '#fff' }}
                onClick={() => statusMutation.mutate('DEREGISTERED')}
                disabled={statusMutation.isPending}
              >
                Yes, Deregister
              </button>
              <button
                style={{ ...btnBase, backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-primary)' }}
                onClick={() => setConfirmDeregister(false)}
              >
                Cancel
              </button>
            </span>
          )}
          {statusError && <span style={{ fontSize: 12, color: 'var(--accent-danger)' }}>{statusError}</span>}
        </div>
      )}

      {/* Agent Info Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Platform</div>
          <div style={valueStyle}>{agent.platform}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Agent Version</div>
          <div style={valueStyle}>{agent.agentVersion ?? '\u2014'}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Enrolled</div>
          <div style={valueStyle}>{agent.enrolledAt ? new Date(agent.enrolledAt).toLocaleString() : '\u2014'}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>Last Heartbeat</div>
          <div style={valueStyle}>{agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleString() : '\u2014'}</div>
        </div>
      </div>

      {!snapshot ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-placeholder)' }}>No inventory snapshots yet.</div>
      ) : (
        <>
          {/* OS & Hardware */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon path={mdiMemory} size={0.85} color="#4f46e5" /> System Info
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <div><div style={labelStyle}>Operating System</div><div style={valueStyle}>{snapshot.operatingSystem ?? '\u2014'}</div></div>
              <div><div style={labelStyle}>OS Version</div><div style={valueStyle}>{snapshot.osVersion ?? '\u2014'}</div></div>
              <div><div style={labelStyle}>CPU</div><div style={valueStyle}>{snapshot.cpuModel ?? '\u2014'}</div></div>
              <div><div style={labelStyle}>CPU Cores</div><div style={valueStyle}>{snapshot.cpuCores ?? '\u2014'}</div></div>
              <div><div style={labelStyle}>RAM (GB)</div><div style={valueStyle}>{snapshot.ramGb != null ? `${snapshot.ramGb} GB` : '\u2014'}</div></div>
              <div><div style={labelStyle}>Collected At</div><div style={valueStyle}>{new Date(snapshot.collectedAt).toLocaleString()}</div></div>
            </div>
          </div>

          {/* Disks */}
          {disks.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiHarddisk} size={0.85} color="#059669" /> Disks ({disks.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Drive</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Label</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>Size (GB)</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>Free (GB)</th>
                  </tr>
                </thead>
                <tbody>
                  {disks.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(d.name ?? d.drive ?? d.mountPoint ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(d.label ?? d.fileSystem ?? '')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{d.sizeGb != null ? Number(d.sizeGb).toFixed(1) : '\u2014'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{d.freeGb != null ? Number(d.freeGb).toFixed(1) : '\u2014'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Network */}
          {nics.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiLan} size={0.85} color="#0891b2" /> Network Interfaces ({nics.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>IP Address</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>MAC</th>
                  </tr>
                </thead>
                <tbody>
                  {nics.map((n, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(n.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12 }}>{String(n.ipAddress ?? n.ip ?? '')}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{String(n.macAddress ?? n.mac ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Installed Software */}
          {software.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiPackageVariantClosed} size={0.85} color="#7c3aed" /> Installed Software ({software.length})
              </h3>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)' }}>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Version</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Publisher</th>
                    </tr>
                  </thead>
                  <tbody>
                    {software.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '6px 10px' }}>{String(s.name ?? '')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(s.version ?? '')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-placeholder)' }}>{String(s.publisher ?? s.vendor ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Snapshot History */}
          {agent.inventorySnapshots.length > 1 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Snapshot History</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Collected</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>OS</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Hostname</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.inventorySnapshots.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{new Date(s.collectedAt).toLocaleString()}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{s.operatingSystem ?? '\u2014'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{s.hostname}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Metrics */}
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiChartLine} size={0.85} color="#0891b2" /> Metrics (Last 24h)
        </h3>
        {metricEntries.length === 0 ? (
          <div style={{ color: 'var(--text-placeholder)', fontSize: 13 }}>No metrics collected yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {metricEntries.map((m) => (
              <div
                key={m.metricName}
                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '12px 16px' }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-placeholder)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  {m.metricName}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                  {typeof m.value === 'number' ? m.value.toFixed(m.value % 1 === 0 ? 0 : 1) : m.value}
                  {m.unit && <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4, fontFamily: 'inherit', fontWeight: 400 }}>{m.unit}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-placeholder)', marginTop: 4 }}>
                  {new Date(m.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deploy Update */}
      <DeployUpdateCard agent={agent} />

      {/* Recent Events */}
      <RecentEventsCard agentId={agentId} />
    </div>
  );
}

interface AgentUpdateRow {
  id: string;
  version: string;
  platform: 'WINDOWS' | 'LINUX' | 'MACOS';
  fileSize: number;
  createdAt: string;
}

function DeployUpdateCard({ agent }: { agent: AgentDetail }) {
  const [version, setVersion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [approverIds, setApproverIds] = useState<string[]>([]);

  const { data: versionsData } = useQuery<AgentUpdateRow[]>({
    queryKey: ['agent-updates', agent.platform],
    queryFn: async () => {
      const res = await fetch(`/api/v1/agents/updates?platform=${agent.platform}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load versions');
      return res.json() as Promise<AgentUpdateRow[]>;
    },
    enabled: !!agent.platform,
  });
  const versions = versionsData ?? [];

  const { data: policy } = useQuery<{ agentDeployRequiresChange: boolean }>({
    queryKey: ['agent-policy'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/agents/policy', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load policy');
      return res.json() as Promise<{ agentDeployRequiresChange: boolean }>;
    },
  });
  const requiresApproval = policy?.agentDeployRequiresChange ?? false;

  const { data: usersData } = useQuery<{ data?: { id: string; email: string; firstName: string | null; lastName: string | null }[] }>({
    queryKey: ['users-for-approval'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load users');
      return res.json();
    },
    enabled: requiresApproval,
  });
  const users = usersData?.data ?? [];

  const cardStyle = {
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  };

  const handleDeploy = async () => {
    setError(null);
    setSuccess(null);
    if (!version) {
      setError('Select a version.');
      return;
    }
    if (requiresApproval && approverIds.length === 0) {
      setError('Pick at least one approver — this tenant requires change approval before deploy.');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        agentIds: [agent.id],
        version,
        platform: agent.platform,
      };
      if (requiresApproval) body.approverIds = approverIds;
      const res = await fetch('/api/v1/agents/updates/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const d = (await res.json()) as {
        deployed?: number;
        deploymentId?: string | null;
        changeId?: string | null;
        status?: string;
      };
      if (d.status === 'PENDING_APPROVAL') {
        setSuccess(
          `Change created, awaiting approval. Deployment will run on approval. Change ID: ${d.changeId ?? ''}`,
        );
      } else {
        setSuccess(`Deployed v${version} — tracking deployment ${d.deploymentId ?? ''}`);
      }
      setVersion('');
      setApproverIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon path={mdiCloudUpload} size={0.85} color="#4f46e5" /> Deploy Update
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
        Push a specific agent version to this endpoint. The agent installs on its next heartbeat (within 5 minutes).
      </p>
      {requiresApproval && (
        <div style={{ marginBottom: 12, padding: 12, backgroundColor: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-secondary)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            Approvers required
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            This tenant requires change approval before agent deploys. Pick one or more approvers.
          </div>
          <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)' }}>
            {users.length === 0 ? (
              <div style={{ padding: 8, fontSize: 13, color: 'var(--text-muted)' }}>No users available.</div>
            ) : (
              users.map((u) => {
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
                const checked = approverIds.includes(u.id);
                return (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setApproverIds((prev) =>
                          e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                        )
                      }
                    />
                    <span>{name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 'auto' }}>{u.email}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="deployVersion" style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            Version
          </label>
          <select
            id="deployVersion"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={versions.length === 0}
            style={{
              padding: '8px 10px',
              border: '1px solid var(--border-secondary)',
              borderRadius: 7,
              fontSize: 14,
              minWidth: 200,
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">{versions.length === 0 ? 'No versions available' : 'Select version…'}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void handleDeploy()}
          disabled={submitting || !version}
          style={{
            padding: '8px 18px',
            backgroundColor: submitting || !version ? '#a5b4fc' : '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            fontSize: 14,
            fontWeight: 600,
            cursor: submitting || !version ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Deploying...' : 'Deploy'}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 10, padding: '6px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginTop: 10, padding: '6px 12px', backgroundColor: 'var(--badge-green-bg-subtle)', border: '1px solid #86efac', borderRadius: 7, color: '#166534', fontSize: 13 }}>
          {success}
        </div>
      )}
    </div>
  );
}

interface AgentEvent {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: string | null;
  message: string;
  context: unknown;
  eventAt: string;
  createdAt: string;
}

interface EventsResponse {
  data: AgentEvent[];
  total: number;
  page: number;
  pageSize: number;
}

function RecentEventsCard({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState<'' | 'INFO' | 'WARN' | 'ERROR'>('');
  const pageSize = 25;

  const { data, isLoading } = useQuery<EventsResponse>({
    queryKey: ['agent-events', agentId, page, level],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (level) qs.set('level', level);
      const res = await fetch(`/api/v1/settings/agents/${agentId}/events?${qs.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load events');
      return res.json() as Promise<EventsResponse>;
    },
    refetchInterval: 15000,
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const cardStyle = {
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  };

  const levelColors: Record<string, { bg: string; color: string }> = {
    INFO:  { bg: 'var(--badge-indigo-bg)', color: '#4338ca' },
    WARN:  { bg: 'var(--badge-yellow-bg)', color: '#92400e' },
    ERROR: { bg: 'var(--badge-red-bg)',    color: '#991b1b' },
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFormatListBulleted} size={0.85} color="#4f46e5" /> Recent Events
        </h3>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value as typeof level);
            setPage(1);
          }}
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border-secondary)',
            borderRadius: 7,
            fontSize: 13,
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">All levels</option>
          <option value="INFO">Info</option>
          <option value="WARN">Warn</option>
          <option value="ERROR">Error</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-placeholder)' }}>
          No events recorded for this agent yet. Events sync from the agent on each heartbeat.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Time</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Level</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const c = levelColors[e.level] ?? { bg: 'var(--bg-tertiary)', color: '#6b7280' };
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(e.eventAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 600, backgroundColor: c.bg, color: c.color }}>
                        {e.level}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{e.category ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>
                      {e.message}
                      {e.context ? (
                        <div style={{ fontSize: 11, color: 'var(--text-placeholder)', fontFamily: 'monospace', marginTop: 2 }}>
                          {JSON.stringify(e.context)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Page {page} of {pageCount} · {total} events
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '4px 10px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 6,
                fontSize: 12,
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              style={{
                padding: '4px 10px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 6,
                fontSize: 12,
                cursor: page >= pageCount ? 'not-allowed' : 'pointer',
                opacity: page >= pageCount ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
