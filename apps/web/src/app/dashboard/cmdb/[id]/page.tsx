'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { CITimeline } from '@/components/cmdb/ci-timeline';
import Icon from '@mdi/react';
import { formatChangeNumber } from '@meridian/core/record-numbers';
import {
  mdiDatabase,
  mdiServer,
  mdiDesktopClassic,
  mdiLanConnect,
  mdiCloud,
  mdiCog,
  mdiApplication,
  mdiShieldLock,
  mdiPackageVariant,
  mdiArrowLeft,
  mdiAlertCircle,
  mdiTicket,
  mdiHistory,
  mdiPencil,
  mdiAccountMultiple,
  mdiWrench,
  mdiLink,
  mdiCheckCircle,
  mdiClipboardText,
  mdiWeb,
  mdiChevronRight,
  mdiCertificate,
  mdiInformationOutline,
  mdiMonitor,
  mdiContentCopy,
  mdiCompare,
  mdiPlus,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CIRelSource {
  id: string;
  relationshipType: string;
  relationshipTypeRef: { forwardLabel: string } | null;
  target: { id: string; name: string; ciNumber: number; hostname: string | null; criticality: string | null };
}

interface CIRelTarget {
  id: string;
  relationshipType: string;
  relationshipTypeRef: { reverseLabel: string } | null;
  source: { id: string; name: string; ciNumber: number; hostname: string | null; criticality: string | null };
}

interface ChangeRecord {
  id: string;
  changeType: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
}

interface CmdbChangeLink {
  id: string;
  impactRole: string | null;
  change: { id: string; changeNumber: number; title: string; type: string; status: string };
}

interface CmdbTicketLink {
  id: string;
  impactRole: string | null;
  ticket: { id: string; ticketNumber: number; title: string; type: string; priority: string; status: string };
}

interface Attestation {
  id: string;
  attestedAt: string;
  attestationStatus: string;
  comments: string | null;
}

interface LegacyTicketLink {
  id: string;
  ticket: { id: string; ticketNumber: number; title: string; type: string; status: string };
}

interface CIDetail {
  id: string;
  tenantId: string;
  ciNumber: number;
  name: string;
  displayName: string | null;
  type: string;
  status: string;
  environment: string;
  ciClass: { id: string; classKey: string; className: string; icon: string | null } | null;
  lifecycleStatus: { id: string; statusKey: string; statusName: string } | null;
  operationalStatus: { id: string; statusKey: string; statusName: string } | null;
  cmdbEnvironment: { id: string; envKey: string; envName: string } | null;
  manufacturer: { id: string; name: string } | null;
  asset: { id: string; assetTag: string; serialNumber: string | null; manufacturer: string | null; model: string | null; status: string; purchaseCost: number | null; warrantyExpiry: string | null; hostname: string | null } | null;
  supportGroup: { id: string; name: string; email: string | null } | null;
  category: { id: string; name: string } | null;
  agentId: string | null;
  hostname: string | null;
  fqdn: string | null;
  ipAddress: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  externalId: string | null;
  model: string | null;
  version: string | null;
  edition: string | null;
  businessOwnerId: string | null;
  technicalOwnerId: string | null;
  businessOwner: { id: string; firstName: string; lastName: string; email: string; displayName: string | null } | null;
  technicalOwner: { id: string; firstName: string; lastName: string; email: string; displayName: string | null } | null;
  criticality: string | null;
  confidentialityClass: string | null;
  integrityClass: string | null;
  availabilityClass: string | null;
  installDate: string | null;
  firstDiscoveredAt: string | null;
  lastVerifiedAt: string | null;
  lastSeenAt: string | null;
  sourceSystem: string | null;
  sourceRecordKey: string | null;
  sourceOfTruth: boolean;
  reconciliationRank: number;
  serverExt: { serverType: string; operatingSystem: string | null; osVersion: string | null; cpuCount: number | null; memoryGb: number | null; storageGb: number | null; backupRequired: boolean; backupPolicy: string | null; patchGroup: string | null; antivirusStatus: string | null } | null;
  applicationExt: { applicationType: string | null; applicationId: string | null; application: { id: string; name: string } | null; internetFacing: boolean; complianceScope: string | null; repoUrl: string | null } | null;
  databaseExt: { dbEngine: string; dbVersion: string | null; instanceName: string | null; port: number | null; backupRequired: boolean; encryptionEnabled: boolean; containsSensitiveData: boolean } | null;
  networkDeviceExt: { deviceType: string; firmwareVersion: string | null; managementIp: string | null; macAddress: string | null; rackLocation: string | null } | null;
  cloudResourceExt: { cloudProvider: string; region: string | null; resourceGroup: string | null; nativeResourceId: string | null } | null;
  endpointExt: { endpointType: string; url: string | null; dnsName: string | null; certificateExpiryDate: string | null; certificateIssuer: string | null; tlsRequired: boolean } | null;
  serviceExt: { serviceType: string; serviceTier: string | null; availabilityTarget: number | null; rtoMinutes: number | null; rpoMinutes: number | null } | null;
  sourceRels: CIRelSource[];
  targetRels: CIRelTarget[];
  changeRecords: ChangeRecord[];
  cmdbChangeLinks: CmdbChangeLink[];
  cmdbIncidentLinks: CmdbTicketLink[];
  cmdbProblemLinks: CmdbTicketLink[];
  attestations: Attestation[];
  ticketLinks: LegacyTicketLink[];
  attributesJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface ImpactCI {
  id: string;
  name: string;
  type: string;
  status: string;
  ciNumber: string;
  direction: string;
  depth: number;
}

interface AffectedApplication {
  applicationId: string;
  applicationName: string;
  criticality: string;
  status: string;
  viaPath: string;
  viaCiId: string | null;
  viaCiName: string | null;
  viaRelType: string | null;
  isDirect: boolean;
}

// ─── Dynamic ReactFlow Import (SSR safe) ─────────────────────────────────────

const RelationshipMap = dynamic(() => import('./RelationshipMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
      Loading relationship map...
    </div>
  ),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCITypeIcon(type: string): string {
  switch (type) {
    case 'SERVER':          return mdiServer;
    case 'WORKSTATION':     return mdiDesktopClassic;
    case 'NETWORK_DEVICE':  return mdiLanConnect;
    case 'DATABASE':        return mdiDatabase;
    case 'CLOUD_RESOURCE':  return mdiCloud;
    case 'SERVICE':         return mdiCog;
    case 'APPLICATION':     return mdiApplication;
    case 'SECURITY_DEVICE': return mdiShieldLock;
    case 'STORAGE':         return mdiPackageVariant;
    default:                return mdiServer;
  }
}

function getStatusBadgeStyle(status: string | undefined | null): { bg: string; text: string } {
  if (!status) return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
  const key = status.toUpperCase();
  if (key === 'ACTIVE' || key === 'OPERATIONAL' || key === 'IN_SERVICE' || key === 'VERIFIED')
    return { bg: 'var(--badge-green-bg)', text: '#065f46' };
  if (key === 'MAINTENANCE' || key === 'DEGRADED' || key === 'PENDING')
    return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
  if (key === 'INACTIVE' || key === 'NON_OPERATIONAL' || key === 'RETIRED')
    return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
  if (key === 'DECOMMISSIONED' || key === 'FAILED' || key === 'REJECTED')
    return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
  return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
}

function getCriticalityStyle(criticality: string | null): { bg: string; text: string } {
  if (!criticality) return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
  switch (criticality.toUpperCase()) {
    case 'CRITICAL': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'HIGH':     return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'MEDIUM':   return { bg: '#dbeafe', text: '#1e40af' };
    case 'LOW':      return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    default:         return { bg: 'var(--bg-tertiary)', text: 'var(--text-muted)' };
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanize(str: string): string {
  return str.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Reusable UI Components ──────────────────────────────────────────────────

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: bg, color: text, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function InfoRow({ label, value, link }: { label: string; value: string | number | null | undefined; link?: string }) {
  const display = value != null && value !== '' ? String(value) : '\u2014';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14, gap: 12 }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      {link && display !== '\u2014' ? (
        <Link href={link} style={{ color: 'var(--accent-primary)', textDecoration: 'none', textAlign: 'right', wordBreak: 'break-word' }}>
          {display}
        </Link>
      ) : (
        <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{display}</span>
      )}
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <Icon path={icon} size={0.8} color="var(--accent-primary)" />}
        {title}
      </h2>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
      {message}
    </div>
  );
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

type Tab = 'general' | 'ownership' | 'technical' | 'service' | 'relationships' | 'governance' | 'linked' | 'baselines' | 'history';

// ─── Inventory Snapshot Section (for CIs with linked agents) ─────────────────

function InventorySnapshotSection({ ciId }: { ciId: string }) {
  const { data: snapshot, isLoading } = useQuery({
    queryKey: ['cmdb-ci-inventory', ciId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cmdb/cis/${ciId}/inventory`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
  });

  if (isLoading) return <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading inventory data...</div>;
  if (!snapshot) return null;

  const cpus = Array.isArray(snapshot.rawData?.hardware?.cpus) ? snapshot.rawData.hardware.cpus : [];
  const memModules = Array.isArray(snapshot.memoryModules) ? snapshot.memoryModules : [];
  const disks = Array.isArray(snapshot.rawData?.hardware?.disks) ? snapshot.rawData.hardware.disks : [];
  const gpus = Array.isArray(snapshot.gpus) ? snapshot.gpus : [];
  const network = Array.isArray(snapshot.networkInterfaces) ? snapshot.networkInterfaces : [];
  const software = Array.isArray(snapshot.installedSoftware) ? snapshot.installedSoftware : [];
  const services = Array.isArray(snapshot.services) ? snapshot.services : [];
  const bitlocker = Array.isArray(snapshot.bitLockerVolumes) ? snapshot.bitLockerVolumes : [];
  const security = snapshot.securityPosture ?? {};
  const battery = snapshot.battery;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '2px solid var(--border-primary)', paddingBottom: 8 }}>
        Agent Inventory Snapshot
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 12 }}>
          Collected {snapshot.collectedAt ? new Date(snapshot.collectedAt).toLocaleString() : '—'}
          {snapshot.scanDurationMs ? ` (${Math.round(snapshot.scanDurationMs)}ms)` : ''}
        </span>
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>

        {/* CPU Details */}
        {cpus.length > 0 && (
          <Card title={`CPU (${cpus.length} socket${cpus.length > 1 ? 's' : ''})`} icon={mdiServer}>
            {cpus.map((cpu: Record<string, unknown>, i: number) => (
              <div key={i} style={{ marginBottom: i < cpus.length - 1 ? 12 : 0, paddingBottom: i < cpus.length - 1 ? 12 : 0, borderBottom: i < cpus.length - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                <InfoRow label="Model" value={cpu.name as string} />
                <InfoRow label="Manufacturer" value={cpu.manufacturer as string} />
                <InfoRow label="Cores / Threads" value={`${cpu.cores ?? '?'} / ${cpu.threads ?? '?'}`} />
                <InfoRow label="Speed" value={cpu.speedMhz ? `${cpu.speedMhz} MHz` : null} />
                <InfoRow label="Max Speed" value={cpu.maxSpeedMhz ? `${cpu.maxSpeedMhz} MHz` : null} />
                <InfoRow label="Socket" value={cpu.socket as string} />
                <InfoRow label="L2 Cache" value={cpu.l2CacheKb ? `${cpu.l2CacheKb} KB` : null} />
                <InfoRow label="L3 Cache" value={cpu.l3CacheKb ? `${cpu.l3CacheKb} KB` : null} />
                <InfoRow label="Part Number" value={cpu.partNumber as string} />
                <InfoRow label="Serial Number" value={cpu.serialNumber as string} />
              </div>
            ))}
          </Card>
        )}

        {/* Memory Modules */}
        {memModules.length > 0 && (
          <Card title={`RAM (${memModules.length} module${memModules.length > 1 ? 's' : ''}, ${snapshot.ramGb ?? '?'} GB total)`} icon={mdiServer}>
            {memModules.map((mod: Record<string, unknown>, i: number) => (
              <div key={i} style={{ marginBottom: i < memModules.length - 1 ? 12 : 0, paddingBottom: i < memModules.length - 1 ? 12 : 0, borderBottom: i < memModules.length - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                <InfoRow label="Slot" value={mod.deviceLocator as string} />
                <InfoRow label="Size" value={mod.capacityBytes ? `${Math.round((mod.capacityBytes as number) / 1073741824)} GB` : null} />
                <InfoRow label="Speed" value={mod.speedMhz ? `${mod.speedMhz} MHz` : null} />
                <InfoRow label="Type" value={mod.memoryType as string} />
                <InfoRow label="Form Factor" value={mod.formFactor as string} />
                <InfoRow label="Manufacturer" value={mod.manufacturer as string} />
                <InfoRow label="Part Number" value={mod.partNumber as string} />
                <InfoRow label="Serial" value={mod.serialNumber as string} />
              </div>
            ))}
          </Card>
        )}

        {/* Disks */}
        {disks.length > 0 && (
          <Card title={`Storage (${disks.length} disk${disks.length > 1 ? 's' : ''})`} icon={mdiDatabase}>
            {disks.map((disk: Record<string, unknown>, i: number) => (
              <div key={i} style={{ marginBottom: i < disks.length - 1 ? 12 : 0, paddingBottom: i < disks.length - 1 ? 12 : 0, borderBottom: i < disks.length - 1 ? '1px solid var(--border-primary)' : 'none' }}>
                <InfoRow label="Device" value={disk.deviceName as string} />
                <InfoRow label="Model" value={disk.model as string} />
                <InfoRow label="Size" value={disk.sizeBytes ? `${Math.round((disk.sizeBytes as number) / 1073741824)} GB` : null} />
                <InfoRow label="Type" value={disk.type as string} />
                <InfoRow label="Bus" value={disk.busType as string} />
                <InfoRow label="SMART" value={disk.smartStatus as string} />
                <InfoRow label="Serial" value={disk.serialNumber as string} />
                {Array.isArray(disk.volumes) && (disk.volumes as Record<string, unknown>[]).map((vol, j) => (
                  <div key={j} style={{ marginLeft: 16, marginTop: 4 }}>
                    <InfoRow label={`${vol.driveLetter || vol.mountPoint}`} value={`${vol.fileSystem ?? ''} — ${vol.sizeBytes ? Math.round((vol.sizeBytes as number) / 1073741824) : '?'} GB (${vol.freeBytes ? Math.round((vol.freeBytes as number) / 1073741824) : '?'} GB free)${vol.isEncrypted ? ' 🔒' : ''}`} />
                  </div>
                ))}
              </div>
            ))}
          </Card>
        )}

        {/* Network Adapters */}
        {network.length > 0 && (
          <Card title={`Network (${network.length} adapter${network.length > 1 ? 's' : ''})`} icon={mdiLanConnect}>
            {network.filter((n: Record<string, unknown>) => {
              const ips = n.ipAddresses as string[] ?? [];
              return ips.length > 0 && !ips.every((ip: string) => ip.startsWith('127.') || ip === '::1');
            }).map((nic: Record<string, unknown>, i: number) => (
              <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-primary)' }}>
                <InfoRow label="Name" value={nic.name as string} />
                <InfoRow label="IPs" value={(nic.ipAddresses as string[] ?? []).join(', ')} />
                <InfoRow label="MAC" value={nic.macAddress as string} />
                <InfoRow label="Speed" value={nic.speedMbps ? `${nic.speedMbps} Mbps` : null} />
                <InfoRow label="Gateway" value={(nic.defaultGateways as string[] ?? []).join(', ')} />
                <InfoRow label="DNS" value={(nic.dnsServers as string[] ?? []).join(', ')} />
                <InfoRow label="DHCP" value={nic.dhcpEnabled ? `Yes (${nic.dhcpServer ?? ''})` : 'Static'} />
                <InfoRow label="SSID" value={nic.wirelessSsid as string} />
              </div>
            ))}
          </Card>
        )}

        {/* GPUs */}
        {gpus.length > 0 && (
          <Card title="GPU" icon={mdiMonitor}>
            {gpus.map((gpu: Record<string, unknown>, i: number) => (
              <div key={i}>
                <InfoRow label="Name" value={gpu.name as string} />
                <InfoRow label="VRAM" value={gpu.vramBytes ? `${Math.round((gpu.vramBytes as number) / 1048576)} MB` : null} />
                <InfoRow label="Driver" value={gpu.driverVersion as string} />
              </div>
            ))}
          </Card>
        )}

        {/* Security Posture */}
        {Object.keys(security).length > 0 && (
          <Card title="Security Posture" icon={mdiShieldLock}>
            <InfoRow label="Antivirus" value={security.antivirusProduct as string} />
            <InfoRow label="AV Version" value={security.antivirusVersion as string} />
            <InfoRow label="Real-Time Protection" value={security.realTimeProtectionEnabled ? 'Enabled' : 'Disabled'} />
            <InfoRow label="Firewall" value={security.firewallEnabled ? 'Enabled' : 'Disabled'} />
            <InfoRow label="Disk Encryption" value={security.diskEncryptionEnabled ? `Enabled (${security.encryptionProduct ?? ''})` : 'Disabled'} />
            <InfoRow label="Secure Boot" value={security.secureBootEnabled ? 'Enabled' : 'Disabled'} />
            <InfoRow label="TPM Ready" value={security.tpmReady ? 'Yes' : 'No'} />
            <InfoRow label="Reboot Required" value={security.rebootRequired ? 'Yes' : 'No'} />
            <InfoRow label="Pending Updates" value={security.pendingUpdateCount} />
          </Card>
        )}

        {/* BitLocker / Encryption */}
        {bitlocker.length > 0 && (
          <Card title="BitLocker / Encryption" icon={mdiShieldLock}>
            {bitlocker.map((vol: Record<string, unknown>, i: number) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <InfoRow label={`Drive ${vol.driveLetter}`} value={`${vol.protectionStatus} — ${vol.encryptionMethod ?? ''} (${vol.encryptionPercentage ?? 0}%)`} />
                {typeof vol.recoveryKeyId === 'string' && vol.recoveryKeyId && <InfoRow label="Recovery Key ID" value={vol.recoveryKeyId} />}
              </div>
            ))}
          </Card>
        )}

        {/* Battery */}
        {battery && (
          <Card title="Battery" icon={mdiServer}>
            <InfoRow label="Health" value={battery.healthPercent ? `${Math.round(battery.healthPercent)}%` : null} />
            <InfoRow label="Design Capacity" value={battery.designCapacityMwh ? `${battery.designCapacityMwh} mWh` : null} />
            <InfoRow label="Full Charge" value={battery.fullChargeCapacityMwh ? `${battery.fullChargeCapacityMwh} mWh` : null} />
            <InfoRow label="Cycle Count" value={battery.cycleCount} />
            <InfoRow label="State" value={battery.chargingState as string} />
          </Card>
        )}

        {/* OS Details */}
        <Card title="OS Details" icon={mdiCog}>
          <InfoRow label="OS" value={snapshot.operatingSystem} />
          <InfoRow label="Version" value={snapshot.osVersion} />
          <InfoRow label="Build" value={snapshot.osBuild} />
          <InfoRow label="Edition" value={snapshot.osEdition} />
          <InfoRow label="BIOS" value={snapshot.biosVersion} />
          <InfoRow label="TPM" value={snapshot.tpmVersion} />
          <InfoRow label="Secure Boot" value={snapshot.secureBootEnabled != null ? (snapshot.secureBootEnabled ? 'Enabled' : 'Disabled') : null} />
          <InfoRow label="Domain" value={snapshot.domainName} />
          <InfoRow label="Virtual" value={snapshot.isVirtual != null ? (snapshot.isVirtual ? `Yes (${snapshot.hypervisorType ?? 'unknown'})` : 'Physical') : null} />
          <InfoRow label="Uptime" value={snapshot.uptimeSeconds ? formatUptime(snapshot.uptimeSeconds) : null} />
        </Card>

        {/* Installed Software Summary */}
        {software.length > 0 && (
          <Card title={`Installed Software (${software.length})`} icon={mdiApplication}>
            <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Version</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Publisher</th>
                  </tr>
                </thead>
                <tbody>
                  {software.slice(0, 200).map((sw: Record<string, unknown>, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '3px 8px' }}>{sw.name as string}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{sw.version as string}</td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{sw.publisher as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {software.length > 200 && <div style={{ padding: 8, color: 'var(--text-muted)', textAlign: 'center' }}>...and {software.length - 200} more</div>}
            </div>
          </Card>
        )}

        {/* Services Summary */}
        {services.length > 0 && (
          <Card title={`Services (${services.length})`} icon={mdiCog}>
            <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '4px 8px', fontWeight: 600 }}>Start Type</th>
                  </tr>
                </thead>
                <tbody>
                  {services.slice(0, 200).map((svc: Record<string, unknown>, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '3px 8px' }}>{(svc.displayName || svc.name) as string}</td>
                      <td style={{ padding: '3px 8px' }}>
                        <span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 11, backgroundColor: (svc.status as string)?.toLowerCase() === 'running' ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: (svc.status as string)?.toLowerCase() === 'running' ? '#065f46' : 'var(--text-muted)' }}>
                          {svc.status as string}
                        </span>
                      </td>
                      <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>{svc.startType as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {services.length > 200 && <div style={{ padding: 8, color: 'var(--text-muted)', textAlign: 'center' }}>...and {services.length - 200} more</div>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

const TAB_DEFS: { key: Tab; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: mdiInformationOutline },
  { key: 'ownership', label: 'Ownership', icon: mdiAccountMultiple },
  { key: 'technical', label: 'Technical', icon: mdiWrench },
  { key: 'service', label: 'Service Context', icon: mdiCog },
  { key: 'relationships', label: 'Relationships', icon: mdiLanConnect },
  { key: 'governance', label: 'Governance', icon: mdiCertificate },
  { key: 'linked', label: 'Linked Records', icon: mdiLink },
  { key: 'baselines', label: 'Baselines', icon: mdiContentCopy },
  { key: 'history', label: 'History', icon: mdiHistory },
];

// ─── CMDB CI Detail Page ──────────────────────────────────────────────────────

export default function CMDBDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [impactData, setImpactData] = useState<ImpactCI[] | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [mapDepth, setMapDepth] = useState(2);
  const [attestLoading, setAttestLoading] = useState(false);

  // Baselines state
  const [baselines, setBaselines] = useState<Array<{ id: string; name: string; createdById: string | null; createdAt: string }>>([]);
  const [baselinesLoading, setBaselinesLoading] = useState(false);
  const [baselinesFetched, setBaselinesFetched] = useState(false);
  const [newBaselineName, setNewBaselineName] = useState('');
  const [baselineCreating, setBaselineCreating] = useState(false);
  const [compareData, setCompareData] = useState<{ baseline: { id: string; name: string; createdAt: string }; totalDifferences: number; differences: Array<{ field: string; baseline: unknown; current: unknown }> } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const { data: ci, isLoading, error, refetch } = useQuery<CIDetail>({
    queryKey: ['cmdb-ci', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cmdb/cis/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load CI: ${res.status}`);
      return res.json() as Promise<CIDetail>;
    },
  });

  // Blast radius: affected applications (lazy — only when Relationships tab)
  const { data: affectedAppsData, isLoading: affectedAppsLoading } = useQuery<{ affected: AffectedApplication[] }>({
    queryKey: ['cmdb-ci-affected-apps', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cmdb/cis/${id}/affected-applications`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load affected applications: ${res.status}`);
      return res.json() as Promise<{ affected: AffectedApplication[] }>;
    },
    enabled: activeTab === 'relationships',
    staleTime: 60_000,
  });

  const runImpactAnalysis = useCallback(async () => {
    setImpactLoading(true);
    try {
      const res = await fetch(`/api/v1/cmdb/cis/${id}/impact?depth=${mapDepth}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Impact analysis failed: ${res.status}`);
      const data = await res.json() as { impacted: ImpactCI[] };
      setImpactData(data.impacted ?? []);
    } catch {
      setImpactData([]);
    } finally {
      setImpactLoading(false);
    }
  }, [id, mapDepth]);

  const handleAttest = useCallback(async () => {
    setAttestLoading(true);
    try {
      const res = await fetch(`/api/v1/cmdb/cis/${id}/attestations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestationStatus: 'verified' }),
      });
      if (!res.ok) throw new Error(`Attestation failed: ${res.status}`);
      await refetch();
    } catch {
      // silently fail — could add toast here
    } finally {
      setAttestLoading(false);
    }
  }, [id, refetch]);

  // Baselines helpers
  const fetchBaselines = useCallback(async () => {
    setBaselinesLoading(true);
    try {
      const res = await fetch(`/api/v1/cmdb/cis/${id}/baselines`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load baselines');
      const data = await res.json() as Array<{ id: string; name: string; createdById: string | null; createdAt: string }>;
      setBaselines(data);
      setBaselinesFetched(true);
    } catch {
      setBaselines([]);
    } finally {
      setBaselinesLoading(false);
    }
  }, [id]);

  const createBaseline = useCallback(async () => {
    if (!newBaselineName.trim()) return;
    setBaselineCreating(true);
    try {
      const res = await fetch(`/api/v1/cmdb/cis/${id}/baselines`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBaselineName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create baseline');
      setNewBaselineName('');
      await fetchBaselines();
    } catch {
      // could add toast
    } finally {
      setBaselineCreating(false);
    }
  }, [id, newBaselineName, fetchBaselines]);

  const compareBaseline = useCallback(async (baselineId: string) => {
    setCompareLoading(true);
    setCompareData(null);
    try {
      const res = await fetch(`/api/v1/cmdb/cis/${id}/baselines/${baselineId}/compare`, { credentials: 'include' });
      if (!res.ok) throw new Error('Compare failed');
      const data = await res.json() as typeof compareData;
      setCompareData(data);
    } catch {
      setCompareData(null);
    } finally {
      setCompareLoading(false);
    }
  }, [id]);

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading CI...</div>;
  }
  if (error || !ci) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
        {error instanceof Error ? error.message : 'CI not found'}
      </div>
    );
  }

  const typeIcon = ci.ciClass?.icon ? getCITypeIcon(ci.ciClass.icon) : getCITypeIcon(ci.type);
  const lifecycleStyle = getStatusBadgeStyle(ci.lifecycleStatus?.statusKey ?? ci.status);
  const opsStyle = getStatusBadgeStyle(ci.operationalStatus?.statusKey);
  const critStyle = getCriticalityStyle(ci.criticality);

  // Derive services this CI supports (from relationships)
  const supportsServices = (ci.sourceRels ?? [])
    .filter((r) => r.relationshipType === 'supports' || r.relationshipType === 'SUPPORTS')
    .map((r) => r.target);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Breadcrumb + Header ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
          <button
            onClick={() => router.push('/dashboard/cmdb')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon path={mdiArrowLeft} size={0.7} color="currentColor" />
            CMDB
          </button>
          <Icon path={mdiChevronRight} size={0.6} color="var(--text-placeholder)" />
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>CI-{ci.ciNumber}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={typeIcon} size={1} color="var(--accent-primary)" />
              {ci.displayName ?? ci.name}
            </h1>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>CI-{ci.ciNumber}</span>
              {ci.ciClass && (
                <Badge label={ci.ciClass.className} bg="var(--bg-tertiary)" text="var(--text-secondary)" />
              )}
              <Badge
                label={ci.lifecycleStatus?.statusName ?? ci.status}
                bg={lifecycleStyle.bg}
                text={lifecycleStyle.text}
              />
              {ci.operationalStatus && (
                <Badge
                  label={ci.operationalStatus.statusName}
                  bg={opsStyle.bg}
                  text={opsStyle.text}
                />
              )}
              {(ci.cmdbEnvironment || ci.environment) && (
                <Badge
                  label={ci.cmdbEnvironment?.envName ?? ci.environment}
                  bg="var(--bg-tertiary)"
                  text="var(--text-muted)"
                />
              )}
              {ci.criticality && (
                <Badge
                  label={ci.criticality}
                  bg={critStyle.bg}
                  text={critStyle.text}
                />
              )}
            </div>
          </div>

          <Link
            href={`/dashboard/cmdb/${id}/edit`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon path={mdiPencil} size={0.8} color="#fff" />
            Edit
          </Link>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent-primary)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 14,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: -1,
            }}
          >
            <Icon path={tab.icon} size={0.8} color="currentColor" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: General ─────────────────────────────────────────────────────── */}
      {activeTab === 'general' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          <Card title="Configuration Item" icon={mdiInformationOutline}>
            <InfoRow label="Name" value={ci.name} />
            {ci.displayName && <InfoRow label="Display Name" value={ci.displayName} />}
            <InfoRow label="CI Number" value={`CI-${ci.ciNumber}`} />
            <InfoRow label="Class" value={ci.ciClass?.className ?? ci.type.replace(/_/g, ' ')} />
            <InfoRow label="Lifecycle Status" value={ci.lifecycleStatus?.statusName ?? ci.status} />
            {ci.operationalStatus && <InfoRow label="Operational Status" value={ci.operationalStatus.statusName} />}
            <InfoRow label="Environment" value={ci.cmdbEnvironment?.envName ?? ci.environment} />
            <InfoRow label="Criticality" value={ci.criticality} />
            <InfoRow label="Category" value={ci.category?.name} />
            <InfoRow label="Created" value={formatDateTime(ci.createdAt)} />
            <InfoRow label="Updated" value={formatDateTime(ci.updatedAt)} />
          </Card>

          <Card title="Classification" icon={mdiShieldLock}>
            <InfoRow label="Confidentiality" value={ci.confidentialityClass} />
            <InfoRow label="Integrity" value={ci.integrityClass} />
            <InfoRow label="Availability" value={ci.availabilityClass} />
          </Card>

          {/* APM ↔ CMDB bridge — show the linked Application when this CI
              has a CmdbCiApplication extension that points back at one. */}
          {ci.applicationExt?.application && (
            <Card title="Linked Application" icon={mdiApplication}>
              <InfoRow
                label="Application"
                value={ci.applicationExt.application.name}
                link={`/dashboard/applications/${ci.applicationExt.application.id}`}
              />
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                This CI is the primary infrastructure record for the linked Application. Open the Application to see its full APM context.
              </p>
            </Card>
          )}

          {ci.asset && (
            <Card title="Linked Asset" icon={mdiPackageVariant}>
              <InfoRow label="Asset Tag" value={ci.asset.assetTag} />
              {ci.asset.serialNumber && <InfoRow label="Serial Number" value={ci.asset.serialNumber} />}
              {(ci.asset.manufacturer || ci.asset.model) && (
                <InfoRow label="Hardware" value={[ci.asset.manufacturer, ci.asset.model].filter(Boolean).join(' ')} />
              )}
              <InfoRow label="Status" value={ci.asset.status ? humanize(ci.asset.status) : null} />
              {ci.asset.purchaseCost != null && (
                <InfoRow label="Purchase Cost" value={`$${ci.asset.purchaseCost.toLocaleString()}`} />
              )}
              {ci.asset.warrantyExpiry && (
                <InfoRow label="Warranty Expiry" value={formatDate(ci.asset.warrantyExpiry)} />
              )}
            </Card>
          )}

          {ci.attributesJson && Object.keys(ci.attributesJson).length > 0 && (
            <Card title="Custom Attributes">
              {Object.entries(ci.attributesJson).map(([key, value]) => (
                <InfoRow key={key} label={humanize(key)} value={String(value ?? '')} />
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Ownership ───────────────────────────────────────────────────── */}
      {activeTab === 'ownership' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          <Card title="Ownership" icon={mdiAccountMultiple}>
            <InfoRow label="Business Owner" value={ci.businessOwner ? (ci.businessOwner.displayName || `${ci.businessOwner.firstName} ${ci.businessOwner.lastName}`) : null} />
            <InfoRow label="Technical Owner" value={ci.technicalOwner ? (ci.technicalOwner.displayName || `${ci.technicalOwner.firstName} ${ci.technicalOwner.lastName}`) : null} />
          </Card>

          <Card title="Support & Vendor" icon={mdiWrench}>
            <InfoRow label="Support Group" value={ci.supportGroup?.name} />
            {ci.supportGroup?.email && (
              <InfoRow label="Support Email" value={ci.supportGroup.email} />
            )}
            <InfoRow label="Manufacturer / Vendor" value={ci.manufacturer?.name} />
          </Card>
        </div>
      )}

      {/* ── Tab: Technical ───────────────────────────────────────────────────── */}
      {activeTab === 'technical' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          <Card title="Identity" icon={mdiWrench}>
            <InfoRow label="Hostname" value={ci.hostname} />
            <InfoRow label="FQDN" value={ci.fqdn} />
            <InfoRow label="IP Address" value={ci.ipAddress} />
            <InfoRow label="Serial Number" value={ci.serialNumber} />
            <InfoRow label="Asset Tag" value={ci.assetTag} />
            <InfoRow label="External ID" value={ci.externalId} />
            <InfoRow label="Model" value={ci.model} />
            <InfoRow label="Version" value={ci.version} />
            <InfoRow label="Edition" value={ci.edition} />
          </Card>

          {/* Server Extension */}
          {ci.serverExt && (
            <Card title="Server Details" icon={mdiServer}>
              <InfoRow label="Server Type" value={ci.serverExt.serverType} />
              <InfoRow label="Operating System" value={ci.serverExt.operatingSystem} />
              <InfoRow label="OS Version" value={ci.serverExt.osVersion} />
              <InfoRow label="CPU Count" value={ci.serverExt.cpuCount} />
              <InfoRow label="Memory (GB)" value={ci.serverExt.memoryGb} />
              <InfoRow label="Storage (GB)" value={ci.serverExt.storageGb} />
              <InfoRow label="Backup Required" value={ci.serverExt.backupRequired ? 'Yes' : 'No'} />
              <InfoRow label="Backup Policy" value={ci.serverExt.backupPolicy} />
              <InfoRow label="Patch Group" value={ci.serverExt.patchGroup} />
              <InfoRow label="Antivirus Status" value={ci.serverExt.antivirusStatus} />
            </Card>
          )}

          {/* Application Extension */}
          {ci.applicationExt && (
            <Card title="Application Details" icon={mdiApplication}>
              <InfoRow label="Application Type" value={ci.applicationExt.applicationType} />
              {ci.applicationExt.application && (
                <InfoRow
                  label="Linked Application"
                  value={ci.applicationExt.application.name}
                  link={`/dashboard/applications/${ci.applicationExt.application.id}`}
                />
              )}
              <InfoRow label="Internet Facing" value={ci.applicationExt.internetFacing ? 'Yes' : 'No'} />
              <InfoRow label="Compliance Scope" value={ci.applicationExt.complianceScope} />
              <InfoRow label="Repository URL" value={ci.applicationExt.repoUrl} />
            </Card>
          )}

          {/* Database Extension */}
          {ci.databaseExt && (
            <Card title="Database Details" icon={mdiDatabase}>
              <InfoRow label="DB Engine" value={ci.databaseExt.dbEngine} />
              <InfoRow label="DB Version" value={ci.databaseExt.dbVersion} />
              <InfoRow label="Instance Name" value={ci.databaseExt.instanceName} />
              <InfoRow label="Port" value={ci.databaseExt.port} />
              <InfoRow label="Backup Required" value={ci.databaseExt.backupRequired ? 'Yes' : 'No'} />
              <InfoRow label="Encryption Enabled" value={ci.databaseExt.encryptionEnabled ? 'Yes' : 'No'} />
              <InfoRow label="Contains Sensitive Data" value={ci.databaseExt.containsSensitiveData ? 'Yes' : 'No'} />
            </Card>
          )}

          {/* Network Device Extension */}
          {ci.networkDeviceExt && (
            <Card title="Network Device Details" icon={mdiLanConnect}>
              <InfoRow label="Device Type" value={ci.networkDeviceExt.deviceType} />
              <InfoRow label="Firmware Version" value={ci.networkDeviceExt.firmwareVersion} />
              <InfoRow label="Management IP" value={ci.networkDeviceExt.managementIp} />
              <InfoRow label="MAC Address" value={ci.networkDeviceExt.macAddress} />
              <InfoRow label="Rack Location" value={ci.networkDeviceExt.rackLocation} />
            </Card>
          )}

          {/* Cloud Resource Extension */}
          {ci.cloudResourceExt && (
            <Card title="Cloud Resource Details" icon={mdiCloud}>
              <InfoRow label="Cloud Provider" value={ci.cloudResourceExt.cloudProvider} />
              <InfoRow label="Region" value={ci.cloudResourceExt.region} />
              <InfoRow label="Resource Group" value={ci.cloudResourceExt.resourceGroup} />
              <InfoRow label="Native Resource ID" value={ci.cloudResourceExt.nativeResourceId} />
            </Card>
          )}

          {/* Endpoint Extension */}
          {ci.endpointExt && (
            <Card title="Endpoint Details" icon={mdiWeb}>
              <InfoRow label="Endpoint Type" value={ci.endpointExt.endpointType} />
              <InfoRow label="URL" value={ci.endpointExt.url} />
              <InfoRow label="DNS Name" value={ci.endpointExt.dnsName} />
              <InfoRow label="Certificate Expiry" value={formatDate(ci.endpointExt.certificateExpiryDate)} />
              <InfoRow label="Certificate Issuer" value={ci.endpointExt.certificateIssuer} />
              <InfoRow label="TLS Required" value={ci.endpointExt.tlsRequired ? 'Yes' : 'No'} />
            </Card>
          )}
        </div>

        {/* Agent Inventory Snapshot (if CI has a linked agent) */}
        {ci.agentId && <InventorySnapshotSection ciId={ci.id} />}
      </>)}

      {/* ── Tab: Service Context ─────────────────────────────────────────────── */}
      {activeTab === 'service' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
          {ci.serviceExt ? (
            <Card title="Service Details" icon={mdiCog}>
              <InfoRow label="Service Type" value={ci.serviceExt.serviceType} />
              <InfoRow label="Service Tier" value={ci.serviceExt.serviceTier} />
              <InfoRow label="Availability Target" value={ci.serviceExt.availabilityTarget != null ? `${ci.serviceExt.availabilityTarget}%` : null} />
              <InfoRow label="RTO (minutes)" value={ci.serviceExt.rtoMinutes} />
              <InfoRow label="RPO (minutes)" value={ci.serviceExt.rpoMinutes} />
            </Card>
          ) : (
            <Card title="Service Context" icon={mdiCog}>
              <div style={{ padding: '12px 0', fontSize: 14, color: 'var(--text-muted)' }}>
                This CI is not a service.
              </div>
              {supportsServices.length > 0 ? (
                <>
                  <h3 style={{ margin: '16px 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Services Supported by this CI
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {supportsServices.map((svc) => (
                      <div key={svc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
                        <Link href={`/dashboard/cmdb/${svc.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                          {svc.name}
                        </Link>
                        <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>CI-{svc.ciNumber}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ padding: '8px 0', fontSize: 13, color: 'var(--text-placeholder)' }}>
                  No service relationships found.
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Relationships ───────────────────────────────────────────────── */}
      {activeTab === 'relationships' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Affected Applications (Blast Radius) */}
          <Card title="Affected Applications" icon={mdiApplication}>
            {affectedAppsLoading ? (
              <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Computing blast radius…
              </div>
            ) : !affectedAppsData || affectedAppsData.affected.length === 0 ? (
              <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
                No applications are linked to this CI or depend on it via relationships.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {affectedAppsData.affected.length} application{affectedAppsData.affected.length !== 1 ? 's' : ''} would be impacted if this CI became unavailable.
                </p>
                {affectedAppsData.affected.map((app, idx) => {
                  const critStyle = getCriticalityStyle(app.criticality);
                  const statStyle = getStatusBadgeStyle(app.status);
                  const isLast = idx === affectedAppsData.affected.length - 1;
                  return (
                    <div
                      key={app.applicationId}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: isLast ? 'none' : '1px solid var(--bg-tertiary)',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Link
                            href={`/dashboard/applications/${app.applicationId}`}
                            style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
                          >
                            {app.applicationName}
                          </Link>
                          {app.isDirect && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              (direct)
                            </span>
                          )}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                          {app.viaPath}
                          {app.viaCiId && (
                            <>
                              {' — '}
                              <Link
                                href={`/dashboard/cmdb/${app.viaCiId}`}
                                style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                              >
                                view CI
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <Badge label={app.criticality} bg={critStyle.bg} text={critStyle.text} />
                        <Badge label={humanize(app.status)} bg={statStyle.bg} text={statStyle.text} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Depth:</span>
              <select
                value={mapDepth}
                onChange={(e) => { setMapDepth(Number(e.target.value)); setImpactData(null); }}
                style={{ padding: '6px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value={1}>1 level</option>
                <option value={2}>2 levels</option>
                <option value={3}>3 levels</option>
              </select>
            </div>
            {impactData === null ? (
              <button
                onClick={() => void runImpactAnalysis()}
                disabled={impactLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  backgroundColor: 'var(--badge-yellow-bg)',
                  color: '#92400e',
                  border: '1px solid #fbbf24',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: impactLoading ? 'not-allowed' : 'pointer',
                  opacity: impactLoading ? 0.6 : 1,
                }}
              >
                <Icon path={mdiAlertCircle} size={0.8} color="currentColor" />
                {impactLoading ? 'Analyzing...' : 'Impact Analysis'}
              </button>
            ) : (
              <button
                onClick={() => setImpactData(null)}
                style={{
                  padding: '7px 14px',
                  backgroundColor: 'var(--badge-red-bg)',
                  color: '#991b1b',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Clear Impact Overlay
              </button>
            )}
            {impactData !== null && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {impactData.length} CI{impactData.length !== 1 ? 's' : ''} impacted
              </span>
            )}
          </div>

          {/* Map */}
          <div style={{ height: 500, border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
            <RelationshipMap ci={ci} impactData={impactData} />
          </div>

          {/* Impact results */}
          {impactData !== null && impactData.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 12 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Impacted CIs</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {impactData.map((imp) => (
                  <Link
                    key={imp.id}
                    href={`/dashboard/cmdb/${imp.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: 'var(--badge-red-bg)', color: '#991b1b', textDecoration: 'none', borderRadius: 12, fontSize: 12, fontWeight: 500 }}
                  >
                    <Icon path={getCITypeIcon(imp.type)} size={0.6} color="currentColor" />
                    {imp.name} (CI-{imp.ciNumber})
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Source Relationships Table */}
          {(ci.sourceRels ?? []).length > 0 && (
            <Card title="Outgoing Relationships (this CI ...)">
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th style={thStyle}>Relationship</th>
                      <th style={thStyle}>Target CI</th>
                      <th style={thStyle}>CI #</th>
                      <th style={thStyle}>Hostname</th>
                      <th style={thStyle}>Criticality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ci.sourceRels ?? []).map((rel) => (
                      <tr key={rel.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={tdStyle}>
                          <Badge
                            label={rel.relationshipTypeRef?.forwardLabel ?? humanize(rel.relationshipType)}
                            bg="var(--bg-tertiary)"
                            text="var(--text-secondary)"
                          />
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/dashboard/cmdb/${rel.target.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {rel.target.name}
                          </Link>
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>CI-{rel.target.ciNumber}</td>
                        <td style={tdStyle}>{rel.target.hostname ?? '\u2014'}</td>
                        <td style={tdStyle}>
                          {rel.target.criticality ? (
                            <Badge label={rel.target.criticality} {...getCriticalityStyle(rel.target.criticality)} />
                          ) : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Target Relationships Table */}
          {(ci.targetRels ?? []).length > 0 && (
            <Card title="Incoming Relationships (... this CI)">
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th style={thStyle}>Source CI</th>
                      <th style={thStyle}>Relationship</th>
                      <th style={thStyle}>CI #</th>
                      <th style={thStyle}>Hostname</th>
                      <th style={thStyle}>Criticality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ci.targetRels ?? []).map((rel) => (
                      <tr key={rel.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={tdStyle}>
                          <Link href={`/dashboard/cmdb/${rel.source.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {rel.source.name}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Badge
                            label={rel.relationshipTypeRef?.reverseLabel ?? humanize(rel.relationshipType)}
                            bg="var(--bg-tertiary)"
                            text="var(--text-secondary)"
                          />
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>CI-{rel.source.ciNumber}</td>
                        <td style={tdStyle}>{rel.source.hostname ?? '\u2014'}</td>
                        <td style={tdStyle}>
                          {rel.source.criticality ? (
                            <Badge label={rel.source.criticality} {...getCriticalityStyle(rel.source.criticality)} />
                          ) : '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {(ci.sourceRels ?? []).length === 0 && (ci.targetRels ?? []).length === 0 && (
            <EmptyState message="No relationships found for this CI" />
          )}
        </div>
      )}

      {/* ── Tab: Governance ──────────────────────────────────────────────────── */}
      {activeTab === 'governance' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          <Card title="Discovery & Verification" icon={mdiCertificate}>
            <InfoRow label="Source System" value={ci.sourceSystem} />
            <InfoRow label="Source Record Key" value={ci.sourceRecordKey} />
            <InfoRow label="Source of Truth" value={ci.sourceOfTruth ? 'Yes' : 'No'} />
            <InfoRow label="Reconciliation Rank" value={ci.reconciliationRank} />
            <InfoRow label="Install Date" value={formatDate(ci.installDate)} />
            <InfoRow label="First Discovered" value={formatDateTime(ci.firstDiscoveredAt)} />
            <InfoRow label="Last Discovered" value={formatDateTime(ci.lastSeenAt)} />
            <InfoRow label="Last Verified" value={formatDateTime(ci.lastVerifiedAt)} />
          </Card>

          <Card title="Attestation History" icon={mdiCheckCircle}>
            <div style={{ marginBottom: 12 }}>
              <button
                onClick={() => void handleAttest()}
                disabled={attestLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: attestLoading ? 'not-allowed' : 'pointer',
                  opacity: attestLoading ? 0.6 : 1,
                }}
              >
                <Icon path={mdiCheckCircle} size={0.8} color="#fff" />
                {attestLoading ? 'Attesting...' : 'Attest Now'}
              </button>
            </div>

            {(ci.attestations ?? []).length === 0 ? (
              <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text-placeholder)' }}>
                No attestations recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {(ci.attestations ?? []).map((att, idx) => {
                  const attStyle = getStatusBadgeStyle(att.attestationStatus);
                  return (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: idx < (ci.attestations ?? []).length - 1 ? '1px solid var(--bg-tertiary)' : 'none',
                        fontSize: 14,
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge label={humanize(att.attestationStatus)} bg={attStyle.bg} text={attStyle.text} />
                        {att.comments && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{att.comments}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(att.attestedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Change History */}
          <div style={{ gridColumn: '1 / -1' }}>
            <Card title="Change History" icon={mdiHistory}>
              {(ci.changeRecords ?? []).length === 0 ? (
                <EmptyState message="No change history recorded" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {(ci.changeRecords ?? []).map((record, idx) => (
                    <div
                      key={record.id}
                      style={{
                        display: 'flex',
                        gap: 16,
                        padding: '12px 0',
                        borderBottom: idx < (ci.changeRecords ?? []).length - 1 ? '1px solid var(--bg-tertiary)' : 'none',
                      }}
                    >
                      <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent-primary)', marginTop: 6 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                            {record.fieldName ? `${humanize(record.fieldName)} changed` : humanize(record.changeType)}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>
                            {formatDateTime(record.createdAt)}
                          </span>
                        </div>
                        {record.fieldName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <span style={{ backgroundColor: 'var(--badge-red-bg)', color: '#991b1b', padding: '1px 6px', borderRadius: 4 }}>
                              {record.oldValue ?? '(empty)'}
                            </span>
                            <span>{'\u2192'}</span>
                            <span style={{ backgroundColor: 'var(--badge-green-bg)', color: '#065f46', padding: '1px 6px', borderRadius: 4 }}>
                              {record.newValue ?? '(empty)'}
                            </span>
                            {record.changedBy && (
                              <span style={{ color: 'var(--text-placeholder)', marginLeft: 4 }}>
                                by {record.changedBy}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── Tab: Linked Records ──────────────────────────────────────────────── */}
      {activeTab === 'linked' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Changes */}
          <Card title="Changes" icon={mdiClipboardText}>
            {(ci.cmdbChangeLinks ?? []).length === 0 ? (
              <EmptyState message="No change records linked" />
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th style={thStyle}>Change #</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Impact Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ci.cmdbChangeLinks ?? []).map((link) => (
                      <tr key={link.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <Link href={`/dashboard/changes/${link.change.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                            {formatChangeNumber(link.change.changeNumber)}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/dashboard/changes/${link.change.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {link.change.title}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Badge label={humanize(link.change.type)} bg="var(--bg-tertiary)" text="var(--text-secondary)" />
                        </td>
                        <td style={tdStyle}>
                          {(() => { const s = getStatusBadgeStyle(link.change.status); return <Badge label={humanize(link.change.status)} bg={s.bg} text={s.text} />; })()}
                        </td>
                        <td style={tdStyle}>{link.impactRole ? humanize(link.impactRole) : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Incidents */}
          <Card title="Incidents" icon={mdiAlertCircle}>
            {(ci.cmdbIncidentLinks ?? []).length === 0 ? (
              <EmptyState message="No incidents linked" />
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th style={thStyle}>Ticket #</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Priority</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Impact Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ci.cmdbIncidentLinks ?? []).map((link) => (
                      <tr key={link.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                            #{link.ticket.ticketNumber}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {link.ticket.title}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          {(() => { const s = getCriticalityStyle(link.ticket.priority); return <Badge label={humanize(link.ticket.priority)} bg={s.bg} text={s.text} />; })()}
                        </td>
                        <td style={tdStyle}>
                          {(() => { const s = getStatusBadgeStyle(link.ticket.status); return <Badge label={humanize(link.ticket.status)} bg={s.bg} text={s.text} />; })()}
                        </td>
                        <td style={tdStyle}>{link.impactRole ? humanize(link.impactRole) : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Problems */}
          <Card title="Problems" icon={mdiAlertCircle}>
            {(ci.cmdbProblemLinks ?? []).length === 0 ? (
              <EmptyState message="No problems linked" />
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th style={thStyle}>Ticket #</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Priority</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Impact Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ci.cmdbProblemLinks ?? []).map((link) => (
                      <tr key={link.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                            #{link.ticket.ticketNumber}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {link.ticket.title}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          {(() => { const s = getCriticalityStyle(link.ticket.priority); return <Badge label={humanize(link.ticket.priority)} bg={s.bg} text={s.text} />; })()}
                        </td>
                        <td style={tdStyle}>
                          {(() => { const s = getStatusBadgeStyle(link.ticket.status); return <Badge label={humanize(link.ticket.status)} bg={s.bg} text={s.text} />; })()}
                        </td>
                        <td style={tdStyle}>{link.impactRole ? humanize(link.impactRole) : '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Legacy Ticket Links */}
          {(ci.ticketLinks ?? []).length > 0 && (
            <Card title="Legacy Ticket Links" icon={mdiTicket}>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <th style={thStyle}>Ticket #</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ci.ticketLinks ?? []).map((link) => (
                      <tr key={link.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                            #{link.ticket.ticketNumber}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Link href={`/dashboard/tickets/${link.ticket.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                            {link.ticket.title}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <Badge label={humanize(link.ticket.type)} bg="var(--bg-tertiary)" text="var(--text-secondary)" />
                        </td>
                        <td style={tdStyle}>
                          {(() => { const s = getStatusBadgeStyle(link.ticket.status); return <Badge label={humanize(link.ticket.status)} bg={s.bg} text={s.text} />; })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {(ci.cmdbChangeLinks ?? []).length === 0 &&
           (ci.cmdbIncidentLinks ?? []).length === 0 &&
           (ci.cmdbProblemLinks ?? []).length === 0 &&
           (ci.ticketLinks ?? []).length === 0 && (
            <EmptyState message="No linked records found" />
          )}
        </div>
      )}

      {/* ── History Tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <CITimeline ciId={ci.id} />
      )}

      {/* ── Baselines Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'baselines' && (
        <div>
          {/* Create baseline */}
          <Card title="Create Baseline" icon={mdiPlus}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Baseline Name
                </label>
                <input
                  type="text"
                  value={newBaselineName}
                  onChange={(e) => setNewBaselineName(e.target.value)}
                  placeholder="e.g. Pre-upgrade snapshot"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: 6,
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={() => void createBaseline()}
                disabled={baselineCreating || !newBaselineName.trim()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: baselineCreating || !newBaselineName.trim() ? 'not-allowed' : 'pointer',
                  opacity: baselineCreating || !newBaselineName.trim() ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {baselineCreating ? 'Creating...' : 'Create Baseline'}
              </button>
            </div>
          </Card>

          {/* Baseline list */}
          <Card title="Saved Baselines" icon={mdiContentCopy}>
            {!baselinesFetched ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <button
                  onClick={() => void fetchBaselines()}
                  disabled={baselinesLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {baselinesLoading ? 'Loading...' : 'Load Baselines'}
                </button>
              </div>
            ) : baselines.length === 0 ? (
              <EmptyState message="No baselines saved yet" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Created</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baselines.map((bl) => (
                      <tr key={bl.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{bl.name}</td>
                        <td style={{ ...tdStyle, fontSize: 13, color: 'var(--text-muted)' }}>
                          {new Date(bl.createdAt).toLocaleString()}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button
                            onClick={() => void compareBaseline(bl.id)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-secondary)',
                              borderRadius: 4,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Icon path={mdiCompare} size={0.6} color="currentColor" />
                            Compare to Current
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Compare result */}
          {compareLoading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Comparing...</div>
          )}
          {compareData && (
            <Card title={`Comparison: "${compareData.baseline.name}" vs Current`} icon={mdiCompare}>
              {compareData.totalDifferences === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No differences found -- CI matches the baseline snapshot.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                    {compareData.totalDifferences} difference{compareData.totalDifferences !== 1 ? 's' : ''} found
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <th style={thStyle}>Field</th>
                        <th style={thStyle}>Baseline Value</th>
                        <th style={thStyle}>Current Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.differences.map((diff) => (
                        <tr key={diff.field} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                          <td style={{ ...tdStyle, fontWeight: 500, fontSize: 13 }}>{diff.field}</td>
                          <td style={{ ...tdStyle, fontSize: 13, color: '#991b1b', backgroundColor: '#fff1f2' }}>
                            {diff.baseline === null || diff.baseline === undefined ? <em style={{ color: 'var(--text-placeholder)' }}>null</em> : String(typeof diff.baseline === 'object' ? JSON.stringify(diff.baseline) : diff.baseline)}
                          </td>
                          <td style={{ ...tdStyle, fontSize: 13, color: '#065f46', backgroundColor: '#ecfdf5' }}>
                            {diff.current === null || diff.current === undefined ? <em style={{ color: 'var(--text-placeholder)' }}>null</em> : String(typeof diff.current === 'object' ? JSON.stringify(diff.current) : diff.current)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared table styles ─────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  fontSize: 13,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: 'var(--text-primary)',
};
