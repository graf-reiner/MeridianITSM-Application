'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiDesktopClassic, mdiMemory, mdiHarddisk, mdiLan, mdiPackageVariantClosed } from '@mdi/js';

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
  const agentId = params.id as string;

  const { data: agent, isLoading, error } = useQuery<AgentDetail>({
    queryKey: ['agent-detail', agentId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/agents/${agentId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load agent');
      return res.json();
    },
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading agent...</div>;
  if (error || !agent) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>Agent not found</div>;

  const snapshot = agent.inventorySnapshots[0];
  const disks = Array.isArray(snapshot?.disks) ? snapshot.disks as Array<Record<string, unknown>> : [];
  const nics = Array.isArray(snapshot?.networkInterfaces) ? snapshot.networkInterfaces as Array<Record<string, unknown>> : [];
  const software = Array.isArray(snapshot?.installedSoftware) ? snapshot.installedSoftware as Array<Record<string, unknown>> : [];

  const cardStyle = { backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: 20, marginBottom: 16 };
  const labelStyle = { fontSize: 12, color: 'var(--text-placeholder)', marginBottom: 2 };
  const valueStyle = { fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 as const };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Link href="/dashboard/settings/agents" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <Icon path={mdiDesktopClassic} size={1.1} color="#0891b2" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{agent.hostname}</h1>
        <StatusBadge status={agent.displayStatus} />
      </div>

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
    </div>
  );
}
