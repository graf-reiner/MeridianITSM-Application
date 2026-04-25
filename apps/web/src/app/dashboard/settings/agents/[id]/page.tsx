'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft, mdiDesktopClassic, mdiMemory, mdiHarddisk, mdiLan,
  mdiPackageVariantClosed, mdiChartLine, mdiCloudUpload, mdiFormatListBulleted,
  mdiServer, mdiMonitor, mdiShieldLock, mdiCog, mdiUpdate, mdiBattery,
  mdiAccountGroup, mdiCloud, mdiSpeedometer, mdiIdentifier,
  mdiPrinter, mdiUsb, mdiCamera, mdiFingerprint, mdiCreditCardOutline, mdiVolumeHigh,
} from '@mdi/js';

interface Snapshot {
  id: string;
  hostname: string | null;
  fqdn?: string | null;
  deviceType?: string | null;
  // OS quick-query
  operatingSystem: string | null;
  osVersion: string | null;
  osBuild?: string | null;
  osEdition?: string | null;
  // CPU quick-query
  cpuModel: string | null;
  cpuCores: number | null;
  cpuThreads?: number | null;
  cpuSpeedMhz?: number | null;
  // Memory
  ramGb: number | null;
  // Hardware identity quick-query
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  biosVersion?: string | null;
  tpmVersion?: string | null;
  secureBootEnabled?: boolean | null;
  // Security quick-query
  diskEncrypted?: boolean | null;
  antivirusProduct?: string | null;
  firewallEnabled?: boolean | null;
  // Directory
  domainName?: string | null;
  // Virtualization
  isVirtual?: boolean | null;
  hypervisorType?: string | null;
  // Uptime
  lastBootTime?: string | null;
  uptimeSeconds?: number | null;
  // JSON collections
  disks?: unknown;
  networkInterfaces?: unknown;
  installedSoftware?: unknown;
  services?: unknown;
  windowsUpdates?: unknown;
  memoryModules?: unknown;
  gpus?: unknown;
  battery?: unknown;
  monitors?: unknown;
  bitLockerVolumes?: unknown;
  securityPosture?: unknown;
  directoryStatus?: unknown;
  performance?: unknown;
  virtualization?: unknown;
  localUsers?: unknown;
  // Connected hardware (added in agent v1.0.0.6)
  printers?: unknown;
  usbDevices?: unknown;
  cameras?: unknown;
  biometricDevices?: unknown;
  smartCardReaders?: unknown;
  audioDevices?: unknown;
  // Compliance hardware
  tpmDetails?: unknown;
  vbsStatus?: unknown;
  rawData?: unknown;
  scanDurationMs?: number | null;
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

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  const display = value != null && value !== '' ? String(value) : '—';
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-placeholder)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>{display}</div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
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
  const services = Array.isArray(snapshot?.services) ? snapshot.services as Array<Record<string, unknown>> : [];
  const windowsUpdates = Array.isArray(snapshot?.windowsUpdates) ? snapshot.windowsUpdates as Array<Record<string, unknown>> : [];
  const memModules = Array.isArray(snapshot?.memoryModules) ? snapshot.memoryModules as Array<Record<string, unknown>> : [];
  const gpus = Array.isArray(snapshot?.gpus) ? snapshot.gpus as Array<Record<string, unknown>> : [];
  const monitors = Array.isArray(snapshot?.monitors) ? snapshot.monitors as Array<Record<string, unknown>> : [];
  const bitLocker = Array.isArray(snapshot?.bitLockerVolumes) ? snapshot.bitLockerVolumes as Array<Record<string, unknown>> : [];
  const localUsers = Array.isArray(snapshot?.localUsers) ? snapshot.localUsers as Array<Record<string, unknown>> : [];
  const battery = (snapshot?.battery && typeof snapshot.battery === 'object') ? snapshot.battery as Record<string, unknown> : null;
  const security = (snapshot?.securityPosture && typeof snapshot.securityPosture === 'object') ? snapshot.securityPosture as Record<string, unknown> : null;
  const directory = (snapshot?.directoryStatus && typeof snapshot.directoryStatus === 'object') ? snapshot.directoryStatus as Record<string, unknown> : null;
  const performance = (snapshot?.performance && typeof snapshot.performance === 'object') ? snapshot.performance as Record<string, unknown> : null;
  const virtualization = (snapshot?.virtualization && typeof snapshot.virtualization === 'object') ? snapshot.virtualization as Record<string, unknown> : null;
  // Connected hardware (v1.0.0.6)
  const printers = Array.isArray(snapshot?.printers) ? snapshot.printers as Array<Record<string, unknown>> : [];
  const usbDevices = Array.isArray(snapshot?.usbDevices) ? snapshot.usbDevices as Array<Record<string, unknown>> : [];
  const cameras = Array.isArray(snapshot?.cameras) ? snapshot.cameras as Array<Record<string, unknown>> : [];
  const biometricDevices = Array.isArray(snapshot?.biometricDevices) ? snapshot.biometricDevices as Array<Record<string, unknown>> : [];
  const smartCardReaders = Array.isArray(snapshot?.smartCardReaders) ? snapshot.smartCardReaders as Array<Record<string, unknown>> : [];
  const audioDevices = Array.isArray(snapshot?.audioDevices) ? snapshot.audioDevices as Array<Record<string, unknown>> : [];
  const tpm = (snapshot?.tpmDetails && typeof snapshot.tpmDetails === 'object') ? snapshot.tpmDetails as Record<string, unknown> : null;
  const vbs = (snapshot?.vbsStatus && typeof snapshot.vbsStatus === 'object') ? snapshot.vbsStatus as Record<string, unknown> : null;

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
          {/* System Info */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon path={mdiMemory} size={0.85} color="#4f46e5" /> System Info
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <Field label="Operating System" value={snapshot.operatingSystem} />
              <Field label="OS Version" value={snapshot.osVersion} />
              <Field label="OS Build" value={snapshot.osBuild} />
              <Field label="OS Edition" value={snapshot.osEdition} />
              <Field label="Domain / Workgroup" value={snapshot.domainName} />
              <Field label="Device Type" value={snapshot.deviceType} />
              <Field label="CPU" value={snapshot.cpuModel} />
              <Field label="Cores / Threads" value={snapshot.cpuCores != null ? `${snapshot.cpuCores}${snapshot.cpuThreads != null ? ` / ${snapshot.cpuThreads}` : ''}` : null} />
              <Field label="CPU Speed" value={snapshot.cpuSpeedMhz != null ? `${snapshot.cpuSpeedMhz} MHz` : null} />
              <Field label="RAM" value={snapshot.ramGb != null ? `${snapshot.ramGb} GB` : null} />
              <Field label="Last Boot" value={snapshot.lastBootTime ? new Date(snapshot.lastBootTime).toLocaleString() : null} />
              <Field label="Uptime" value={snapshot.uptimeSeconds ? formatUptime(snapshot.uptimeSeconds) : null} />
              <Field label="Collected At" value={new Date(snapshot.collectedAt).toLocaleString()} />
              <Field label="Scan Duration" value={snapshot.scanDurationMs != null ? `${Math.round(snapshot.scanDurationMs)} ms` : null} />
            </div>
          </div>

          {/* Hardware Identity */}
          {(snapshot.manufacturer || snapshot.model || snapshot.serialNumber || snapshot.biosVersion || snapshot.tpmVersion || tpm) && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiIdentifier} size={0.85} color="#7c3aed" /> Hardware Identity
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                <Field label="Manufacturer" value={snapshot.manufacturer} />
                <Field label="Model" value={snapshot.model} />
                <Field label="Serial Number" value={snapshot.serialNumber} />
                <Field label="BIOS Version" value={snapshot.biosVersion} />
                <Field label="Secure Boot" value={snapshot.secureBootEnabled != null ? (snapshot.secureBootEnabled ? 'Enabled' : 'Disabled') : null} />
              </div>
              {/* TPM details (rich, replaces minimal tpmVersion field) */}
              {(tpm?.present === true || snapshot.tpmVersion) && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>TPM</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                    <Field label="Present" value={tpm ? (tpm.present ? 'Yes' : 'No') : null} />
                    <Field label="Manufacturer" value={tpm?.manufacturer as string} />
                    <Field label="Spec Version" value={(tpm?.specVersion as string) ?? snapshot.tpmVersion} />
                    <Field label="Manufacturer Version" value={tpm?.manufacturerVersion as string} />
                    <Field label="Physical Presence" value={tpm?.physicalPresenceVersion as string} />
                    <Field label="Activated" value={tpm?.isActivated != null ? (tpm.isActivated ? 'Yes' : 'No') : null} />
                    <Field label="Enabled" value={tpm?.isEnabled != null ? (tpm.isEnabled ? 'Yes' : 'No') : null} />
                    <Field label="Owned" value={tpm?.isOwned != null ? (tpm.isOwned ? 'Yes' : 'No') : null} />
                    <Field label="Ready" value={tpm?.isReady != null ? (tpm.isReady ? 'Yes' : 'No') : null} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Memory Modules */}
          {memModules.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiServer} size={0.85} color="#4f46e5" /> Memory Modules ({memModules.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Slot</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>Size</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Type</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>Speed</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Part #</th>
                  </tr>
                </thead>
                <tbody>
                  {memModules.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(m.deviceLocator ?? m.bankLabel ?? '')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.capacityBytes ? `${Math.round(Number(m.capacityBytes) / 1073741824)} GB` : '\u2014'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(m.memoryType ?? '')} {String(m.formFactor ?? '')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{m.speedMhz ? `${m.speedMhz} MHz` : '\u2014'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(m.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-placeholder)' }}>{String(m.partNumber ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Disks */}
          {disks.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiHarddisk} size={0.85} color="#059669" /> Disks ({disks.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {disks.map((d, i) => {
                  const volumes = Array.isArray(d.volumes) ? d.volumes as Array<Record<string, unknown>> : [];
                  return (
                    <div key={i} style={{ border: '1px solid var(--border-primary)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: volumes.length > 0 ? 12 : 0 }}>
                        <Field label="Model" value={String(d.model ?? d.deviceName ?? '\u2014')} />
                        <Field label="Size" value={d.sizeBytes ? `${Math.round(Number(d.sizeBytes) / 1073741824)} GB` : null} />
                        <Field label="Type" value={String(d.type ?? '')} />
                        <Field label="Bus" value={String(d.busType ?? '')} />
                        <Field label="Serial" value={String(d.serialNumber ?? '')} />
                        <Field label="SMART" value={String(d.smartStatus ?? '')} />
                      </div>
                      {volumes.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                              <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)' }}>Drive</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)' }}>Label</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)' }}>FS</th>
                              <th style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>Size</th>
                              <th style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>Free</th>
                              <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)' }}>Encrypted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {volumes.map((v, j) => (
                              <tr key={j} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                                <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{String(v.driveLetter ?? v.mountPoint ?? '')}</td>
                                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{String(v.label ?? '')}</td>
                                <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{String(v.fileSystem ?? '')}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{v.sizeBytes ? `${(Number(v.sizeBytes) / 1073741824).toFixed(1)} GB` : '\u2014'}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{v.freeBytes != null ? `${(Number(v.freeBytes) / 1073741824).toFixed(1)} GB` : '\u2014'}</td>
                                <td style={{ padding: '4px 8px' }}>{v.isEncrypted ? '\ud83d\udd12' : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
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
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>IP Address(es)</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>MAC</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>Speed</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Gateway</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nics.map((n, i) => {
                    const ips = Array.isArray(n.ipAddresses) ? (n.ipAddresses as string[]).filter((ip) => ip && !ip.startsWith('127.') && ip !== '::1') : [];
                    const gws = Array.isArray(n.defaultGateways) ? (n.defaultGateways as string[]).filter(Boolean) : [];
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '6px 10px' }}>{String(n.name ?? '')}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12 }}>{ips.length > 0 ? ips.join(', ') : '\u2014'}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{String(n.macAddress ?? '\u2014')}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{n.speedMbps ? `${n.speedMbps} Mbps` : '\u2014'}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{gws.length > 0 ? gws.join(', ') : '\u2014'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(n.status ?? '')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* GPUs */}
          {gpus.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiMonitor} size={0.85} color="#76b900" /> GPUs ({gpus.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>VRAM</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {gpus.map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(g.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(g.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{g.vramBytes ? `${Math.round(Number(g.vramBytes) / 1073741824)} GB` : '\u2014'}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{String(g.driverVersion ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Monitors */}
          {monitors.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiMonitor} size={0.85} color="#0891b2" /> Monitors ({monitors.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Serial</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {monitors.map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(m.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(m.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{String(m.serialNumber ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(m.resolution ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Battery */}
          {battery && (battery.designCapacityMwh || battery.fullChargeCapacityMwh || battery.healthPercent) && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiBattery} size={0.85} color="#059669" /> Battery
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                <Field label="Health" value={battery.healthPercent ? `${Math.round(Number(battery.healthPercent))}%` : null} />
                <Field label="Design Capacity" value={battery.designCapacityMwh ? `${battery.designCapacityMwh} mWh` : null} />
                <Field label="Full Charge" value={battery.fullChargeCapacityMwh ? `${battery.fullChargeCapacityMwh} mWh` : null} />
                <Field label="Cycle Count" value={battery.cycleCount as number | null | undefined} />
                <Field label="State" value={battery.chargingState as string} />
                <Field label="Chemistry" value={battery.chemistry as string} />
              </div>
            </div>
          )}

          {/* Printers */}
          {printers.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiPrinter} size={0.85} color="#0891b2" /> Printers ({printers.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Port</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Driver</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Type</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {printers.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>
                        {String(p.name ?? '')}
                        {p.default ? <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 9999, fontSize: 10, backgroundColor: 'var(--badge-green-bg)', color: '#065f46' }}>Default</span> : null}
                        {p.shared ? <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 9999, fontSize: 10, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>Shared</span> : null}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{String(p.portName ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(p.driverName ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{p.network ? 'Network' : 'Local'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(p.status ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-placeholder)' }}>{String(p.location ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* USB Devices */}
          {usbDevices.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiUsb} size={0.85} color="#7c3aed" /> USB Devices ({usbDevices.length})
              </h3>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)' }}>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Device ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usbDevices.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '6px 10px' }}>{String(d.name ?? '')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(d.manufacturer ?? '')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(d.status ?? '')}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-placeholder)', wordBreak: 'break-all' }}>{String(d.deviceId ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cameras */}
          {cameras.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiCamera} size={0.85} color="#059669" /> Cameras ({cameras.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cameras.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(c.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(c.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(c.status ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Biometric Devices */}
          {biometricDevices.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiFingerprint} size={0.85} color="#7c3aed" /> Biometric Devices ({biometricDevices.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Type</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {biometricDevices.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 11, backgroundColor: 'var(--badge-purple-bg, var(--bg-tertiary))', color: 'var(--text-muted)' }}>
                          {String(b.deviceType ?? 'Other')}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>{String(b.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(b.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(b.status ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Smart Card Readers */}
          {smartCardReaders.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiCreditCardOutline} size={0.85} color="#dc2626" /> Smart Card Readers ({smartCardReaders.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Driver</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {smartCardReaders.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(s.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(s.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(s.driverVersion ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(s.status ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Audio Devices */}
          {audioDevices.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiVolumeHigh} size={0.85} color="#0891b2" /> Audio Devices ({audioDevices.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Manufacturer</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Product</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audioDevices.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(a.name ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(a.manufacturer ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(a.productName ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(a.status ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Security Posture */}
          {((security && Object.keys(security).length > 0) || vbs) && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiShieldLock} size={0.85} color="#dc2626" /> Security Posture
              </h3>
              {security && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  <Field label="Antivirus" value={security.antivirusProduct as string} />
                  <Field label="AV Version" value={security.antivirusVersion as string} />
                  <Field label="Real-Time Protection" value={security.realTimeProtectionEnabled != null ? (security.realTimeProtectionEnabled ? 'Enabled' : 'Disabled') : null} />
                  <Field label="Firewall" value={security.firewallEnabled != null ? (security.firewallEnabled ? `Enabled${security.firewallProfile ? ` (${security.firewallProfile})` : ''}` : 'Disabled') : null} />
                  <Field label="Disk Encryption" value={security.diskEncryptionEnabled != null ? (security.diskEncryptionEnabled ? `Enabled${security.encryptionProduct ? ` (${security.encryptionProduct})` : ''}` : 'Disabled') : null} />
                  <Field label="Secure Boot" value={security.secureBootEnabled != null ? (security.secureBootEnabled ? 'Enabled' : 'Disabled') : null} />
                  <Field label="TPM Ready" value={security.tpmReady != null ? (security.tpmReady ? 'Yes' : 'No') : null} />
                  <Field label="Reboot Required" value={security.rebootRequired != null ? (security.rebootRequired ? 'Yes' : 'No') : null} />
                  <Field label="Pending Updates" value={security.pendingUpdateCount as number} />
                  <Field label="Last Security Update" value={security.lastSecurityUpdate ? new Date(security.lastSecurityUpdate as string).toLocaleDateString() : null} />
                </div>
              )}
              {/* VBS / HVCI / Credential Guard (Win11 baseline) */}
              {vbs && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-primary)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>Virtualization-Based Security</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                    <Field label="VBS Enabled" value={vbs.enabled != null ? (vbs.enabled ? 'Yes' : 'No') : null} />
                    <Field label="VBS Running" value={vbs.running != null ? (vbs.running ? 'Yes' : 'No') : null} />
                    <Field label="HVCI Enabled" value={vbs.hvciEnabled != null ? (vbs.hvciEnabled ? 'Yes' : 'No') : null} />
                    <Field label="HVCI Running" value={vbs.hvciRunning != null ? (vbs.hvciRunning ? 'Yes' : 'No') : null} />
                    <Field label="Credential Guard Enabled" value={vbs.credentialGuardEnabled != null ? (vbs.credentialGuardEnabled ? 'Yes' : 'No') : null} />
                    <Field label="Credential Guard Running" value={vbs.credentialGuardRunning != null ? (vbs.credentialGuardRunning ? 'Yes' : 'No') : null} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BitLocker Volumes */}
          {bitLocker.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiShieldLock} size={0.85} color="#7c3aed" /> BitLocker ({bitLocker.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Drive</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Method</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>Encrypted %</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Recovery Key ID</th>
                  </tr>
                </thead>
                <tbody>
                  {bitLocker.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{String(b.driveLetter ?? '')}</td>
                      <td style={{ padding: '6px 10px' }}>{String(b.protectionStatus ?? '')}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(b.encryptionMethod ?? '')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>{b.encryptionPercentage != null ? `${b.encryptionPercentage}%` : '\u2014'}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-placeholder)' }}>{String(b.recoveryKeyId ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Directory / MDM Status */}
          {directory && (directory.adJoined || directory.azureAdJoined || directory.mdmEnrolled) && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiAccountGroup} size={0.85} color="#0891b2" /> Directory / MDM
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                <Field label="AD Joined" value={directory.adJoined ? 'Yes' : 'No'} />
                <Field label="AD Domain" value={directory.adDomainName as string} />
                <Field label="Azure AD Joined" value={directory.azureAdJoined ? 'Yes' : 'No'} />
                <Field label="Azure AD Device ID" value={directory.azureAdDeviceId as string} />
                <Field label="MDM Enrolled" value={directory.mdmEnrolled ? 'Yes' : 'No'} />
                <Field label="MDM Provider" value={directory.mdmProvider as string} />
                <Field label="Compliance State" value={directory.complianceState as string} />
                <Field label="Last Sync" value={directory.lastSyncTime ? new Date(directory.lastSyncTime as string).toLocaleString() : null} />
              </div>
            </div>
          )}

          {/* Virtualization */}
          {virtualization && virtualization.isVirtual && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiCloud} size={0.85} color="#0891b2" /> Virtualization
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                <Field label="Hypervisor" value={virtualization.hypervisorType as string} />
                <Field label="VM Name" value={virtualization.vmName as string} />
                <Field label="Host" value={virtualization.hostName as string} />
                <Field label="Cloud Provider" value={virtualization.cloudProvider as string} />
                <Field label="Instance ID" value={virtualization.instanceId as string} />
                <Field label="Instance Type" value={virtualization.instanceType as string} />
                <Field label="Region" value={virtualization.region as string} />
                <Field label="vCPUs" value={virtualization.allocatedVcpus as number} />
              </div>
            </div>
          )}

          {/* Performance */}
          {performance && (performance.cpuUtilizationPercent != null || performance.memoryUtilizationPercent != null) && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiSpeedometer} size={0.85} color="#dc2626" /> Performance (at scan time)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                <Field label="CPU Utilization" value={performance.cpuUtilizationPercent != null ? `${Number(performance.cpuUtilizationPercent).toFixed(1)}%` : null} />
                <Field label="Memory Utilization" value={performance.memoryUtilizationPercent != null ? `${Number(performance.memoryUtilizationPercent).toFixed(1)}%` : null} />
                <Field label="Memory Used" value={performance.memoryUsedBytes ? `${(Number(performance.memoryUsedBytes) / 1073741824).toFixed(1)} GB` : null} />
                <Field label="Memory Available" value={performance.memoryAvailableBytes ? `${(Number(performance.memoryAvailableBytes) / 1073741824).toFixed(1)} GB` : null} />
              </div>
            </div>
          )}

          {/* Services */}
          {services.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiCog} size={0.85} color="#6b7280" /> Services ({services.length})
              </h3>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)' }}>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Display Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Status</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Start Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s, i) => {
                      const status = String(s.status ?? '').toLowerCase();
                      const running = status === 'running';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                          <td style={{ padding: '6px 10px' }}>{String(s.displayName ?? s.name ?? '')}</td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{String(s.name ?? '')}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 11, backgroundColor: running ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: running ? '#065f46' : 'var(--text-muted)' }}>
                              {String(s.status ?? '')}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(s.startType ?? '')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Windows Updates */}
          {windowsUpdates.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiUpdate} size={0.85} color="#0891b2" /> Windows Updates ({windowsUpdates.length})
              </h3>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-primary)' }}>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>KB</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Description</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Installed</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windowsUpdates.map((u, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{String(u.hotFixId ?? '')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{String(u.description ?? u.title ?? '')}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{u.installedDate ? new Date(u.installedDate as string).toLocaleDateString() : '\u2014'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-placeholder)' }}>{String(u.installedBy ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Local Users */}
          {localUsers.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiAccountGroup} size={0.85} color="#7c3aed" /> Local Users ({localUsers.length})
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Username</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Admin</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>Last Logon</th>
                  </tr>
                </thead>
                <tbody>
                  {localUsers.map((u, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '6px 10px' }}>{String(u.username ?? '')}</td>
                      <td style={{ padding: '6px 10px' }}>{u.isAdmin ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{u.lastLogon ? new Date(u.lastLogon as string).toLocaleString() : '\u2014'}</td>
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
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{s.hostname ?? '\u2014'}</td>
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
