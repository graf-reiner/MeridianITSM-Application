'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiApplicationCog,
  mdiLinkVariant,
  mdiFileDocument,
  mdiDesktopClassic,
  mdiHistory,
  mdiPlus,
  mdiAlertCircle,
  mdiOpenInNew,
  mdiAccountMultiple,
  mdiServerNetwork,
  mdiLan,
  mdiCertificate,
  mdiInformationOutline,
  mdiLifebuoy,
  mdiDatabase,
  mdiCloudOutline,
  mdiRouterNetwork,
  mdiPlusCircleOutline,
  mdiPencil,
} from '@mdi/js';
import Breadcrumb from '@/components/Breadcrumb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApplicationDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  criticality: string;
  description: string | null;
  hostingModel: string | null;
  techStack: string[];
  authMethod: string | null;
  dataClassification: string | null;
  annualCost: number | null;
  rpo: number | null;
  rto: number | null;
  lifecycleStage: string | null;
  strategicRating: number | null;
  // APM ↔ CMDB bridge fields
  primaryCiId: string | null;
  supportNotes: string | null;
  specialNotes: string | null;
  osRequirements: string | null;
  vendorContact: string | null;
  licenseInfo: string | null;
  createdAt: string;
  updatedAt: string;
  dependencies: Array<{
    id: string;
    targetApplication: { id: string; name: string; status: string; criticality: string };
    dependencyType: string;
    description: string | null;
  }>;
  dependents: Array<{
    id: string;
    sourceApplication: { id: string; name: string; status: string; criticality: string };
    dependencyType: string;
    description: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    documentType: string;
    url: string;
    description: string | null;
    createdAt: string;
  }>;
  applicationAssets: Array<{
    id: string;
    relationshipType: string;
    isPrimary: boolean;
    asset: { id: string; assetTag: string; manufacturer: string | null; model: string | null };
  }>;
  activities: Array<{
    id: string;
    activityType: string;
    description: string;
    createdAt: string;
    actor: { id: string; name: string } | null;
  }>;
}

type CertStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'NOTICE' | 'OK';

interface InfraOwnerCard {
  id: string;
  displayName: string;
  email: string;
}

interface InfraCi {
  ciId: string;
  ciNumber: number;
  name: string;
  classKey: string | null;
  className: string | null;
  environment: { id: string; envKey: string; envName: string } | null;
  hostname: string | null;
  ipAddress: string | null;
  status: string;
  server: {
    osType: string | null;
    osVersion: string | null;
    cpuCores: number | null;
    memoryGb: number | null;
    virtualizationPlatform: string | null;
    isVirtual: boolean;
  } | null;
  database: {
    engine: string;
    version: string | null;
    port: number | null;
    encryptionEnabled: boolean;
    containsSensitiveData: boolean;
  } | null;
  cloudResource: {
    provider: string;
    region: string | null;
    accountId: string | null;
    resourceType: string | null;
  } | null;
  networkDevice: {
    deviceType: string;
    managementIp: string | null;
    macAddress: string | null;
    rackLocation: string | null;
  } | null;
  endpoint: {
    url: string | null;
    protocol: string | null;
    port: number | null;
    certificateExpiryDate: string | null;
    daysUntilExpiry: number | null;
  } | null;
  relationship: {
    type: string;
    direction: 'outgoing' | 'incoming';
  };
}

interface InfraEndpoint {
  ciId: string;
  ciNumber: number;
  name: string;
  endpointType: string;
  protocol: string | null;
  port: number | null;
  url: string | null;
  dnsName: string | null;
  tlsRequired: boolean;
  certificateExpiryDate: string | null;
  certificateIssuer: string | null;
  daysUntilExpiry: number | null;
  status: CertStatus | null;
}

interface InfraNetworkPort {
  ciId: string;
  ciName: string;
  source: 'endpoint' | 'database' | 'network_device';
  protocol: string | null;
  port: number | null;
  address: string | null;
}

interface ApplicationInfrastructure {
  primaryCi: {
    id: string;
    ciNumber: number;
    name: string;
    classKey: string | null;
    className: string | null;
    businessOwner: InfraOwnerCard | null;
    technicalOwner: InfraOwnerCard | null;
    supportGroup: { id: string; name: string } | null;
  } | null;
  cisByClass: Record<string, InfraCi[]>;
  endpoints: InfraEndpoint[];
  networkPorts: InfraNetworkPort[];
  environments: Array<{
    environmentId: string | null;
    envKey: string | null;
    envName: string | null;
    ciId: string;
    ciName: string;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CRITICALITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: 'var(--badge-red-bg)', text: '#991b1b', dot: '#dc2626' },
  HIGH:     { bg: 'var(--badge-orange-bg)', text: '#9a3412', dot: '#ea580c' },
  MEDIUM:   { bg: 'var(--badge-yellow-bg-subtle)', text: '#854d0e', dot: '#ca8a04' },
  LOW:      { bg: 'var(--badge-green-bg-subtle)', text: '#065f46', dot: '#22c55e' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE:         { bg: 'var(--badge-green-bg-subtle)', text: '#065f46' },
  INACTIVE:       { bg: 'var(--bg-secondary)', text: '#6b7280' },
  IN_DEVELOPMENT: { bg: 'var(--badge-blue-bg-subtle)', text: '#1e40af' },
  DEPRECATED:     { bg: 'var(--badge-fuchsia-bg)', text: '#7e22ce' },
  DECOMMISSIONED: { bg: 'var(--bg-secondary)', text: '#9ca3af' },
};

const CERT_STATUS_COLORS: Record<CertStatus, { bg: string; text: string }> = {
  EXPIRED:  { bg: 'var(--badge-red-bg)', text: '#991b1b' },
  CRITICAL: { bg: 'var(--badge-red-bg-subtle)', text: '#dc2626' },
  WARNING:  { bg: 'var(--badge-orange-bg)', text: '#9a3412' },
  NOTICE:   { bg: 'var(--badge-yellow-bg-subtle)', text: '#854d0e' },
  OK:       { bg: 'var(--badge-green-bg-subtle)', text: '#065f46' },
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ARCHITECTURE:      'Architecture',
  RUNBOOK:           'Runbook',
  USER_GUIDE:        'User Guide',
  API_DOCS:          'API Docs',
  SLA_DOCUMENT:      'SLA Document',
  VENDOR_CONTRACT:   'Vendor Contract',
  DISASTER_RECOVERY: 'DR Plan',
  CHANGE_LOG:        'Change Log',
  SECURITY_POLICY:   'Security Policy',
  DATA_DICTIONARY:   'Data Dictionary',
  OTHER:             'Other',
};

const DEPENDENCY_TYPE_COLORS: Record<string, string> = {
  DEPENDS_ON:   '#3b82f6',
  CONNECTS_TO:  '#6366f1',
  HOSTED_BY:    '#8b5cf6',
  USES_SERVICE: '#0ea5e9',
  AUTHENTICATES_VIA: '#f59e0b',
  STORES_DATA_IN: '#10b981',
  MANAGED_BY:   '#6b7280',
};

const CI_CLASS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  server:               { label: 'Servers', icon: mdiServerNetwork, color: '#3b82f6' },
  database:             { label: 'Databases', icon: mdiDatabase, color: '#8b5cf6' },
  cloud_resource:       { label: 'Cloud Resources', icon: mdiCloudOutline, color: '#0ea5e9' },
  network_device:       { label: 'Network Devices', icon: mdiRouterNetwork, color: '#10b981' },
  endpoint:             { label: 'Endpoints', icon: mdiLan, color: '#f59e0b' },
  application:          { label: 'Applications', icon: mdiApplicationCog, color: '#6366f1' },
  application_instance: { label: 'Application Instances', icon: mdiApplicationCog, color: '#6366f1' },
  service:              { label: 'Services', icon: mdiApplicationCog, color: '#ec4899' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatExpiry(iso: string | null, days: number | null): string {
  if (!iso) return '—';
  const date = new Date(iso).toISOString().slice(0, 10);
  if (days === null) return date;
  if (days < 0) return `${date} (expired ${Math.abs(days)}d ago)`;
  return `${date} (in ${days}d)`;
}

// ─── Reusable sub-components ──────────────────────────────────────────────────

const sectionStyle = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 12,
  marginBottom: 16,
  overflow: 'hidden' as const,
};

const sectionHeaderStyle = {
  padding: '12px 18px',
  borderBottom: '1px solid var(--border-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: 'var(--bg-secondary)',
};

function Card({
  title,
  icon,
  iconColor = 'var(--accent-primary)',
  children,
  action,
}: {
  title: string;
  icon?: string;
  iconColor?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        {icon && <Icon path={icon} size={0.85} color={iconColor} />}
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  const isEmpty = value == null || value === '' || value === '—';
  return (
    <div>
      <dt style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 13,
          color: isEmpty ? 'var(--border-secondary)' : 'var(--text-primary)',
          fontStyle: isEmpty ? 'italic' : 'normal',
          wordBreak: 'break-word' as const,
        }}
      >
        {isEmpty ? 'Not set' : value}
      </dd>
    </div>
  );
}

function CertBadge({ status, days }: { status: CertStatus | null; days: number | null }) {
  if (!status) return <span style={{ color: 'var(--text-placeholder)', fontSize: 12 }}>—</span>;
  const c = CERT_STATUS_COLORS[status];
  const label = status === 'EXPIRED'
    ? `EXPIRED${days !== null ? ` ${Math.abs(days)}d` : ''}`
    : days !== null
      ? `${days}d`
      : status;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, backgroundColor: c.bg, color: c.text, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function OwnerCardView({ label, owner }: { label: string; owner: InfraOwnerCard | null }) {
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </div>
      {owner ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{owner.displayName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{owner.email}</div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>Not assigned</div>
      )}
    </div>
  );
}

// ─── Add Document Form (unchanged) ────────────────────────────────────────────

function AddDocumentForm({ appId, onDone }: { appId: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('OTHER');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/applications/${appId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          documentType,
          url: url.trim(),
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to add document');
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add document');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 7,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Title *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} placeholder="Document title" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Type</label>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} style={inputStyle}>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>URL *</label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required style={inputStyle} placeholder="https://..." />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Optional description" />
      </div>
      {error && (
        <div style={{ padding: '6px 10px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 6, color: 'var(--accent-danger)', fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiAlertCircle} size={0.65} color="currentColor" />
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onDone} style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting || !title.trim() || !url.trim()} style={{ padding: '6px 14px', backgroundColor: isSubmitting ? '#a5b4fc' : 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
          {isSubmitting ? 'Adding...' : 'Add Document'}
        </button>
      </div>
    </form>
  );
}

// ─── Inline editor for the 5 APM-only text fields (Support tab) ───────────────

interface SupportFields {
  supportNotes: string | null;
  specialNotes: string | null;
  osRequirements: string | null;
  vendorContact: string | null;
  licenseInfo: string | null;
}

function SupportNotesEditor({
  appId,
  initial,
  onDone,
}: {
  appId: string;
  initial: SupportFields;
  onDone: () => void;
}) {
  const [supportNotes, setSupportNotes] = useState(initial.supportNotes ?? '');
  const [specialNotes, setSpecialNotes] = useState(initial.specialNotes ?? '');
  const [osRequirements, setOsRequirements] = useState(initial.osRequirements ?? '');
  const [vendorContact, setVendorContact] = useState(initial.vendorContact ?? '');
  const [licenseInfo, setLicenseInfo] = useState(initial.licenseInfo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          supportNotes: supportNotes.trim() || null,
          specialNotes: specialNotes.trim() || null,
          osRequirements: osRequirements.trim() || null,
          vendorContact: vendorContact.trim() || null,
          licenseInfo: licenseInfo.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save');
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border-secondary)',
    borderRadius: 7,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit' as const,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
      <div>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Support Notes (runbook narrative)
        </label>
        <textarea
          value={supportNotes}
          onChange={(e) => setSupportNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: 100, resize: 'vertical' as const }}
          placeholder="Operational notes, runbook steps, common troubleshooting..."
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Special Notes (operational quirks)
        </label>
        <textarea
          value={specialNotes}
          onChange={(e) => setSpecialNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' as const }}
          placeholder='Quirks like "Only supports Windows 10+" or "Requires Java 11"'
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            OS Requirements
          </label>
          <input value={osRequirements} onChange={(e) => setOsRequirements(e.target.value)} style={inputStyle} placeholder="e.g. Windows Server 2019+" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Vendor Contact
          </label>
          <input value={vendorContact} onChange={(e) => setVendorContact(e.target.value)} style={inputStyle} placeholder="support@vendor.com / +1 555 0100" />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          License Info
        </label>
        <textarea
          value={licenseInfo}
          onChange={(e) => setLicenseInfo(e.target.value)}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' as const }}
          placeholder="License type, key, seat count, renewal date..."
        />
      </div>
      {error && (
        <div style={{ padding: '6px 10px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 6, color: 'var(--accent-danger)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiAlertCircle} size={0.65} color="currentColor" />
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onDone} style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={saving}
          style={{ padding: '6px 14px', backgroundColor: saving ? '#a5b4fc' : 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab =
  | 'overview'
  | 'support'
  | 'infrastructure'
  | 'network'
  | 'certificates'
  | 'dependencies'
  | 'documents'
  | 'assets'
  | 'activity';

const TAB_DEFS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',       label: 'Overview',          icon: mdiInformationOutline },
  { key: 'support',        label: 'Support',           icon: mdiLifebuoy },
  { key: 'infrastructure', label: 'Infrastructure',    icon: mdiServerNetwork },
  { key: 'network',        label: 'Network & Endpoints', icon: mdiLan },
  { key: 'certificates',   label: 'Certificates',      icon: mdiCertificate },
  { key: 'dependencies',   label: 'Dependencies',      icon: mdiLinkVariant },
  { key: 'documents',      label: 'Documents',         icon: mdiFileDocument },
  { key: 'assets',         label: 'Assets',            icon: mdiDesktopClassic },
  { key: 'activity',       label: 'Activity',          icon: mdiHistory },
];

// Tabs that share the infrastructure query
const INFRA_TABS: Tab[] = ['support', 'infrastructure', 'network', 'certificates'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [creatingPrimary, setCreatingPrimary] = useState(false);

  const { data: app, isLoading, error } = useQuery<ApplicationDetail>({
    queryKey: ['application', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load application');
      return res.json() as Promise<ApplicationDetail>;
    },
    enabled: !!id,
  });

  // Lazy infrastructure load — only when one of the infra tabs is visited
  const {
    data: infra,
    isLoading: infraLoading,
    error: infraError,
  } = useQuery<ApplicationInfrastructure>({
    queryKey: ['application-infrastructure', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications/${id}/infrastructure`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load infrastructure');
      return res.json() as Promise<ApplicationInfrastructure>;
    },
    enabled: !!id && INFRA_TABS.includes(activeTab),
    staleTime: 60_000,
  });

  const handleCreatePrimaryCi = async () => {
    if (!id) return;
    setCreatingPrimary(true);
    try {
      const res = await fetch(`/api/v1/applications/${id}/create-primary-ci`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create primary CI');
      }
      await qc.invalidateQueries({ queryKey: ['application', id] });
      await qc.invalidateQueries({ queryKey: ['application-infrastructure', id] });
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Failed to create primary CI');
    } finally {
      setCreatingPrimary(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 0', textAlign: 'center', color: 'var(--text-placeholder)' }}>
        Loading application...
      </div>
    );
  }

  if (error || !app) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-danger)' }}>
          <Icon path={mdiAlertCircle} size={1} color="currentColor" />
          <span>Application not found or failed to load.</span>
        </div>
        <button
          onClick={() => router.back()}
          style={{ marginTop: 12, padding: '7px 14px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const crit = CRITICALITY_COLORS[app.criticality] ?? CRITICALITY_COLORS.LOW;
  const stat = STATUS_COLORS[app.status] ?? STATUS_COLORS.INACTIVE;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: 'Applications', href: '/dashboard/applications' }, { label: app.name }]} />

      {/* Header */}
      <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: crit.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${crit.dot}` }}>
            <Icon path={mdiApplicationCog} size={1.3} color={crit.dot} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{app.name}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{app.type}</span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: stat.bg, color: stat.text }}>{app.status.replace('_', ' ')}</span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, backgroundColor: crit.bg, color: crit.text }}>{app.criticality}</span>
              {app.primaryCiId && (
                <Link
                  href={`/dashboard/cmdb/${app.primaryCiId}`}
                  style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: 'var(--badge-blue-bg-subtle)', color: '#1e40af', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  title="Open the linked CMDB Configuration Item"
                >
                  <Icon path={mdiServerNetwork} size={0.55} color="currentColor" />
                  Primary CI
                </Link>
              )}
            </div>
          </div>
          <Link
            href={`/dashboard/applications/${id}/edit`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Icon path={mdiPencil} size={0.75} color="currentColor" />
            Edit
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', marginBottom: 16, gap: 0, overflowX: 'auto' }}>
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent-primary)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: -1,
            }}
          >
            <Icon path={tab.icon} size={0.75} color="currentColor" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Overview tab ──────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <Card title="Application Details" icon={mdiApplicationCog}>
          {app.description && (
            <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{app.description}</p>
          )}
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, margin: 0 }}>
            <InfoRow label="Hosting Model" value={app.hostingModel} />
            <InfoRow label="Auth Method" value={app.authMethod} />
            <InfoRow label="Data Classification" value={app.dataClassification} />
            <InfoRow label="Annual Cost" value={app.annualCost != null ? formatCurrency(app.annualCost) : null} />
            <InfoRow label="RPO (Recovery Point)" value={formatHours(app.rpo)} />
            <InfoRow label="RTO (Recovery Time)" value={formatHours(app.rto)} />
            <InfoRow label="Lifecycle Stage" value={app.lifecycleStage} />
            <InfoRow label="Strategic Rating" value={app.strategicRating != null ? `${app.strategicRating}/5` : null} />
            <InfoRow label="OS Requirements" value={app.osRequirements} />
            <InfoRow label="Special Notes" value={app.specialNotes} />
          </dl>
          {app.techStack && app.techStack.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <dt style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Tech Stack
              </dt>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {app.techStack.map((tech) => (
                  <span key={tech} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--badge-blue-bg-subtle)', color: '#1e40af' }}>{tech}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── Support tab ───────────────────────────────────────────────────── */}
      {activeTab === 'support' && (
        <>
          {/* Yellow banner if no primary CI */}
          {!app.primaryCiId && (
            <div
              style={{
                backgroundColor: 'var(--badge-yellow-bg-subtle)',
                border: '1px solid #fde68a',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Icon path={mdiAlertCircle} size={1} color="#92400e" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>No primary CI linked</div>
                <div style={{ fontSize: 12, color: '#854d0e' }}>
                  Link this Application to its CMDB record to enable owners, infrastructure, and certificate tracking.
                </div>
              </div>
              <button
                onClick={() => void handleCreatePrimaryCi()}
                disabled={creatingPrimary}
                style={{
                  padding: '7px 14px',
                  backgroundColor: '#92400e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: creatingPrimary ? 'not-allowed' : 'pointer',
                  opacity: creatingPrimary ? 0.6 : 1,
                }}
              >
                {creatingPrimary ? 'Creating…' : 'Create Primary CI'}
              </button>
            </div>
          )}

          {/* Owner cards from primary CI */}
          {app.primaryCiId && (
            <Card title="Ownership" icon={mdiAccountMultiple}>
              {infraLoading ? (
                <div style={{ color: 'var(--text-placeholder)', fontSize: 13 }}>Loading…</div>
              ) : infra?.primaryCi ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <OwnerCardView label="Business Owner" owner={infra.primaryCi.businessOwner} />
                  <OwnerCardView label="Technical Owner" owner={infra.primaryCi.technicalOwner} />
                  <div style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Support Group</div>
                    {infra.primaryCi.supportGroup ? (
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{infra.primaryCi.supportGroup.name}</div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>Not assigned</div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-placeholder)', fontSize: 13 }}>Unable to load primary CI.</div>
              )}
            </Card>
          )}

          {/* Notes editor / read-only display */}
          <Card
            title="Support Notes"
            icon={mdiLifebuoy}
            iconColor="#0ea5e9"
            action={
              !editingNotes ? (
                <button
                  onClick={() => setEditingNotes(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Icon path={mdiPencil} size={0.6} color="currentColor" />
                  Edit
                </button>
              ) : null
            }
          >
            {editingNotes ? (
              <SupportNotesEditor
                appId={id}
                initial={{
                  supportNotes: app.supportNotes,
                  specialNotes: app.specialNotes,
                  osRequirements: app.osRequirements,
                  vendorContact: app.vendorContact,
                  licenseInfo: app.licenseInfo,
                }}
                onDone={() => {
                  setEditingNotes(false);
                  void qc.invalidateQueries({ queryKey: ['application', id] });
                }}
              />
            ) : (
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, margin: 0 }}>
                <InfoRow
                  label="Runbook / Support Notes"
                  value={app.supportNotes ? <span style={{ whiteSpace: 'pre-wrap' }}>{app.supportNotes}</span> : null}
                />
                <InfoRow label="Vendor Contact" value={app.vendorContact} />
                <InfoRow
                  label="License Info"
                  value={app.licenseInfo ? <span style={{ whiteSpace: 'pre-wrap' }}>{app.licenseInfo}</span> : null}
                />
              </dl>
            )}
          </Card>
        </>
      )}

      {/* ─── Infrastructure tab ────────────────────────────────────────────── */}
      {activeTab === 'infrastructure' && (
        <InfrastructureTab infra={infra} loading={infraLoading} error={infraError ? String(infraError) : null} appHasPrimaryCi={!!app.primaryCiId} />
      )}

      {/* ─── Network & Endpoints tab ───────────────────────────────────────── */}
      {activeTab === 'network' && (
        <NetworkTab infra={infra} loading={infraLoading} />
      )}

      {/* ─── Certificates tab ──────────────────────────────────────────────── */}
      {activeTab === 'certificates' && (
        <CertificatesTab infra={infra} loading={infraLoading} />
      )}

      {/* ─── Dependencies tab (existing) ───────────────────────────────────── */}
      {activeTab === 'dependencies' && (
        <Card
          title="Dependencies"
          icon={mdiLinkVariant}
          iconColor="#8b5cf6"
          action={
            <button
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <Icon path={mdiPlus} size={0.65} color="currentColor" />
              Add Dependency
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Depends On ({app.dependencies.length})
              </h3>
              {app.dependencies.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>No outgoing dependencies</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {app.dependencies.map((dep) => {
                    const depCrit = CRITICALITY_COLORS[dep.targetApplication.criticality] ?? CRITICALITY_COLORS.LOW;
                    return (
                      <Link
                        key={dep.id}
                        href={`/dashboard/applications/${dep.targetApplication.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: depCrit.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{dep.targetApplication.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-blue-bg-subtle)', color: DEPENDENCY_TYPE_COLORS[dep.dependencyType] ?? '#6b7280' }}>
                          {dep.dependencyType.replace('_', ' ')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Depended On By ({app.dependents.length})
              </h3>
              {app.dependents.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>No incoming dependencies</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {app.dependents.map((dep) => {
                    const depCrit = CRITICALITY_COLORS[dep.sourceApplication.criticality] ?? CRITICALITY_COLORS.LOW;
                    return (
                      <Link
                        key={dep.id}
                        href={`/dashboard/applications/${dep.sourceApplication.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: depCrit.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{dep.sourceApplication.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-orange-bg-subtle)', color: '#ea580c' }}>
                          {dep.dependencyType.replace('_', ' ')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Documents tab (existing) ──────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <Card
          title={`Documents (${app.documents.length})`}
          icon={mdiFileDocument}
          iconColor="var(--accent-success)"
          action={
            <button
              onClick={() => setShowAddDoc((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <Icon path={mdiPlus} size={0.65} color="currentColor" />
              Add Document
            </button>
          }
        >
          {showAddDoc && (
            <AddDocumentForm
              appId={id}
              onDone={() => {
                setShowAddDoc(false);
                void qc.invalidateQueries({ queryKey: ['application', id] });
              }}
            />
          )}
          {app.documents.length === 0 && !showAddDoc ? (
            <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic', margin: 0 }}>No documents attached yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {app.documents.map((doc) => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
                  <Icon path={mdiFileDocument} size={0.9} color="var(--text-muted)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: doc.description ? 3 : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{doc.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-blue-bg-subtle)', color: '#3b82f6' }}>
                        {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </span>
                    </div>
                    {doc.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{doc.description}</p>}
                  </div>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    <Icon path={mdiOpenInNew} size={0.7} color="currentColor" />
                    Open
                  </a>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ─── Assets tab (existing) ─────────────────────────────────────────── */}
      {activeTab === 'assets' && (
        <Card
          title={`Linked Assets (${app.applicationAssets.length})`}
          icon={mdiDesktopClassic}
          iconColor="var(--accent-warning)"
          action={
            <button style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Icon path={mdiPlus} size={0.65} color="currentColor" />
              Link Asset
            </button>
          }
        >
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Linked Assets are procurement records (warranty, asset tag). For operational infrastructure see the Infrastructure tab.
          </p>
          {app.applicationAssets.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic', margin: 0 }}>No assets linked yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {app.applicationAssets.map((aa) => (
                <div key={aa.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8 }}>
                  <Icon path={mdiDesktopClassic} size={0.8} color="var(--accent-warning)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                    {aa.asset.assetTag}
                    {(aa.asset.manufacturer ?? aa.asset.model) && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        {[aa.asset.manufacturer, aa.asset.model].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-orange-bg-subtle)', color: '#ea580c' }}>
                    {aa.relationshipType}
                  </span>
                  {aa.isPrimary && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-yellow-bg)', color: '#92400e' }}>Primary</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ─── Activity tab (existing) ───────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <Card title="Activity Trail" icon={mdiHistory} iconColor="var(--text-muted)">
          {app.activities.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic', margin: 0 }}>No activity recorded yet</p>
          ) : (
            <div style={{ position: 'relative' }}>
              {app.activities.map((act, idx) => (
                <div key={act.id} style={{ display: 'flex', gap: 12, paddingBottom: 12, position: 'relative' }}>
                  {idx < app.activities.length - 1 && (
                    <div style={{ position: 'absolute', left: 10, top: 22, bottom: 0, width: 2, backgroundColor: 'var(--border-primary)' }} />
                  )}
                  <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: 'var(--border-primary)', border: '2px solid var(--border-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#9ca3af' }} />
                  </div>
                  <div style={{ flex: 1, paddingTop: 2 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{act.actor?.name ?? 'System'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 8, backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>{act.activityType}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-placeholder)', marginLeft: 'auto' }}>{timeAgo(act.createdAt)}</span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{act.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Infrastructure tab content ───────────────────────────────────────────────

function InfrastructureTab({
  infra,
  loading,
  error,
  appHasPrimaryCi,
}: {
  infra: ApplicationInfrastructure | undefined;
  loading: boolean;
  error: string | null;
  appHasPrimaryCi: boolean;
}) {
  if (loading) return <Card title="Infrastructure" icon={mdiServerNetwork}>Loading…</Card>;
  if (error) return <Card title="Infrastructure" icon={mdiServerNetwork}>Failed to load: {error}</Card>;
  if (!appHasPrimaryCi || !infra?.primaryCi) {
    return (
      <Card title="Infrastructure" icon={mdiServerNetwork}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
          No primary CI linked. Use the Support tab to create one.
        </p>
      </Card>
    );
  }

  const classes = Object.keys(infra.cisByClass).sort();

  if (classes.length === 0) {
    return (
      <Card title="Infrastructure" icon={mdiServerNetwork}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
          No infrastructure linked to this application. Add CmdbRelationship rows from the primary CI to surface servers, databases, endpoints, etc.
        </p>
      </Card>
    );
  }

  return (
    <>
      {classes.map((classKey) => {
        const meta = CI_CLASS_LABELS[classKey] ?? { label: classKey, icon: mdiServerNetwork, color: 'var(--text-muted)' };
        const cis = infra.cisByClass[classKey];
        return (
          <Card key={classKey} title={`${meta.label} (${cis.length})`} icon={meta.icon} iconColor={meta.color}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {cis.map((ci) => (
                <CiCardView key={ci.ciId} ci={ci} />
              ))}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function CiCardView({ ci }: { ci: InfraCi }) {
  return (
    <Link
      href={`/dashboard/cmdb/${ci.ciId}`}
      style={{
        display: 'block',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 10,
        padding: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1, wordBreak: 'break-word' }}>{ci.name}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>CI-{ci.ciNumber}</span>
      </div>
      {ci.environment && (
        <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-blue-bg-subtle)', color: '#1e40af', marginBottom: 8 }}>
          {ci.environment.envName}
        </div>
      )}
      {ci.server && (
        <dl style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          {ci.server.osType && <div>OS: {ci.server.osType} {ci.server.osVersion}</div>}
          {(ci.server.cpuCores !== null || ci.server.memoryGb !== null) && (
            <div>
              {ci.server.cpuCores !== null && `${ci.server.cpuCores} vCPU`}
              {ci.server.cpuCores !== null && ci.server.memoryGb !== null && ' · '}
              {ci.server.memoryGb !== null && `${ci.server.memoryGb} GB RAM`}
            </div>
          )}
          {ci.server.virtualizationPlatform && (
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-fuchsia-bg)', color: '#7e22ce' }}>
                Virtual ({ci.server.virtualizationPlatform})
              </span>
            </div>
          )}
        </dl>
      )}
      {ci.database && (
        <dl style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div>Engine: {ci.database.engine}{ci.database.version ? ` ${ci.database.version}` : ''}</div>
          {ci.database.port && <div>Port: {ci.database.port}</div>}
          {ci.database.encryptionEnabled && (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: 'var(--badge-green-bg-subtle)', color: '#065f46' }}>
                Encrypted
              </span>
            </div>
          )}
        </dl>
      )}
      {ci.cloudResource && (
        <dl style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div>Provider: {ci.cloudResource.provider}</div>
          {ci.cloudResource.region && <div>Region: {ci.cloudResource.region}</div>}
          {ci.cloudResource.resourceType && <div>Type: {ci.cloudResource.resourceType}</div>}
        </dl>
      )}
      {ci.networkDevice && (
        <dl style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          <div>Type: {ci.networkDevice.deviceType}</div>
          {ci.networkDevice.managementIp && <div>Mgmt IP: {ci.networkDevice.managementIp}</div>}
          {ci.networkDevice.rackLocation && <div>Rack: {ci.networkDevice.rackLocation}</div>}
        </dl>
      )}
      {ci.endpoint && (
        <dl style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          {ci.endpoint.url && <div style={{ wordBreak: 'break-all' }}>URL: {ci.endpoint.url}</div>}
          {ci.endpoint.port && <div>Port: {ci.endpoint.port}</div>}
        </dl>
      )}
    </Link>
  );
}

// ─── Network & Endpoints tab content ──────────────────────────────────────────

function NetworkTab({ infra, loading }: { infra: ApplicationInfrastructure | undefined; loading: boolean }) {
  if (loading) return <Card title="Network & Endpoints" icon={mdiLan}>Loading…</Card>;
  if (!infra) return <Card title="Network & Endpoints" icon={mdiLan}>No data.</Card>;

  return (
    <>
      <Card title={`Endpoints (${infra.endpoints.length})`} icon={mdiLan} iconColor="#f59e0b">
        {infra.endpoints.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>No endpoints linked.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  {['Name', 'URL', 'Protocol', 'Port', 'TLS', 'Cert Status'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {infra.endpoints.map((ep) => (
                  <tr key={ep.ciId} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      <Link href={`/dashboard/cmdb/${ep.ciId}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                        {ep.name}
                      </Link>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{ep.url ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{ep.protocol ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{ep.port ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{ep.tlsRequired ? '✓' : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <CertBadge status={ep.status} days={ep.daysUntilExpiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Network Ports (${infra.networkPorts.length})`} icon={mdiRouterNetwork} iconColor="#10b981">
        {infra.networkPorts.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>No network ports discovered.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  {['CI', 'Source', 'Protocol', 'Port', 'Address'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {infra.networkPorts.map((p, idx) => (
                  <tr key={`${p.ciId}-${idx}`} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      <Link href={`/dashboard/cmdb/${p.ciId}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                        {p.ciName}
                      </Link>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{p.source}</td>
                    <td style={{ padding: '8px 10px' }}>{p.protocol ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{p.port ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{p.address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Certificates tab content ─────────────────────────────────────────────────

function CertificatesTab({ infra, loading }: { infra: ApplicationInfrastructure | undefined; loading: boolean }) {
  if (loading) return <Card title="Certificates" icon={mdiCertificate}>Loading…</Card>;
  if (!infra) return <Card title="Certificates" icon={mdiCertificate}>No data.</Card>;

  const certs = infra.endpoints
    .filter((e) => e.certificateExpiryDate !== null)
    .sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));

  return (
    <Card title={`Certificates (${certs.length})`} icon={mdiCertificate} iconColor="#dc2626">
      {certs.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-placeholder)', fontStyle: 'italic' }}>
          No certificates tracked. Add a CmdbCiEndpoint linked to this Application's primary CI with a certificateExpiryDate.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                {['Status', 'Endpoint', 'URL', 'Issuer', 'Expiry'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {certs.map((cert) => (
                <tr key={cert.ciId} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <CertBadge status={cert.status} days={cert.daysUntilExpiry} />
                  </td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                    <Link href={`/dashboard/cmdb/${cert.ciId}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                      {cert.name}
                    </Link>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{cert.url ?? '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{cert.certificateIssuer ?? '—'}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{formatExpiry(cert.certificateExpiryDate, cert.daysUntilExpiry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
