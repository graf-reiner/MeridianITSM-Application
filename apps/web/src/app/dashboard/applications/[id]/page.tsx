'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiApplicationCog,
  mdiLinkVariant,
  mdiFileDocument,
  mdiDesktopClassic,
  mdiHistory,
  mdiPlus,
  mdiAlertCircle,
  mdiOpenInNew,
  mdiChevronRight,
} from '@mdi/js';

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
  createdAt: string;
  updatedAt: string;
  dependencies: Array<{
    id: string;
    targetApp: { id: string; name: string; status: string; criticality: string };
    dependencyType: string;
    description: string | null;
  }>;
  dependents: Array<{
    id: string;
    sourceApp: { id: string; name: string; status: string; criticality: string };
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

// ─── Constants ────────────────────────────────────────────────────────────────

const CRITICALITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
  HIGH:     { bg: '#ffedd5', text: '#9a3412', dot: '#ea580c' },
  MEDIUM:   { bg: '#fefce8', text: '#854d0e', dot: '#ca8a04' },
  LOW:      { bg: '#f0fdf4', text: '#065f46', dot: '#22c55e' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE:         { bg: '#f0fdf4', text: '#065f46' },
  INACTIVE:       { bg: '#f9fafb', text: '#6b7280' },
  IN_DEVELOPMENT: { bg: '#eff6ff', text: '#1e40af' },
  DEPRECATED:     { bg: '#fdf4ff', text: '#7e22ce' },
  DECOMMISSIONED: { bg: '#f9fafb', text: '#9ca3af' },
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

// ─── Add Document Form ────────────────────────────────────────────────────────

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
        body: JSON.stringify({ title: title.trim(), documentType, url: url.trim(), description: description.trim() || null }),
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
    border: '1px solid #d1d5db',
    borderRadius: 7,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#374151' }}>Title *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} placeholder="Document title" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#374151' }}>Type</label>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} style={inputStyle}>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#374151' }}>URL *</label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required style={inputStyle} placeholder="https://..." />
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 3, fontSize: 12, fontWeight: 600, color: '#374151' }}>Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Optional description" />
      </div>
      {error && (
        <div style={{ padding: '6px 10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiAlertCircle} size={0.65} color="currentColor" />
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onDone} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
        <button type="submit" disabled={isSubmitting || !title.trim() || !url.trim()} style={{ padding: '6px 14px', backgroundColor: isSubmitting ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
          {isSubmitting ? 'Adding...' : 'Add Document'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const [showAddDoc, setShowAddDoc] = useState(false);

  const { data: app, isLoading, error } = useQuery<ApplicationDetail>({
    queryKey: ['application', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/applications/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load application');
      return res.json() as Promise<ApplicationDetail>;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 0', textAlign: 'center', color: '#9ca3af' }}>
        Loading application...
      </div>
    );
  }

  if (error || !app) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
          <Icon path={mdiAlertCircle} size={1} color="currentColor" />
          <span>Application not found or failed to load.</span>
        </div>
        <button
          onClick={() => router.back()}
          style={{ marginTop: 12, padding: '7px 14px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, cursor: 'pointer', backgroundColor: '#fff' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const crit = CRITICALITY_COLORS[app.criticality] ?? CRITICALITY_COLORS.LOW;
  const stat = STATUS_COLORS[app.status] ?? STATUS_COLORS.INACTIVE;

  const sectionStyle = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden' as const,
  };

  const sectionHeaderStyle = {
    padding: '12px 18px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Link href="/dashboard/applications" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Application Portfolio
        </Link>
        <Icon path={mdiChevronRight} size={0.7} color="#9ca3af" />
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{app.name}</span>
      </div>

      {/* Header */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: crit.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${crit.dot}` }}>
            <Icon path={mdiApplicationCog} size={1.3} color={crit.dot} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#111827' }}>{app.name}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: '#f3f4f6', color: '#374151' }}>{app.type}</span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: stat.bg, color: stat.text }}>{app.status.replace('_', ' ')}</span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, backgroundColor: crit.bg, color: crit.text }}>{app.criticality}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Details */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon path={mdiApplicationCog} size={0.85} color="#4f46e5" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Application Details</h2>
        </div>
        <div style={{ padding: 18 }}>
          {app.description && (
            <p style={{ margin: '0 0 16px', color: '#374151', fontSize: 14, lineHeight: 1.6 }}>{app.description}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {[
              { label: 'Hosting Model', value: app.hostingModel },
              { label: 'Auth Method', value: app.authMethod },
              { label: 'Data Classification', value: app.dataClassification },
              { label: 'Annual Cost', value: app.annualCost != null ? formatCurrency(app.annualCost) : null },
              { label: 'RPO (Recovery Point)', value: formatHours(app.rpo) },
              { label: 'RTO (Recovery Time)', value: formatHours(app.rto) },
              { label: 'Lifecycle Stage', value: app.lifecycleStage },
              { label: 'Strategic Rating', value: app.strategicRating != null ? `${app.strategicRating}/5` : null },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</dt>
                <dd style={{ margin: 0, fontSize: 13, color: value ? '#111827' : '#d1d5db', fontStyle: value ? 'normal' : 'italic' }}>
                  {value ?? 'Not set'}
                </dd>
              </div>
            ))}
          </div>
          {app.techStack && app.techStack.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <dt style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Tech Stack</dt>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {app.techStack.map((tech) => (
                  <span key={tech} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: '#eff6ff', color: '#1e40af' }}>{tech}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Dependencies */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon path={mdiLinkVariant} size={0.85} color="#8b5cf6" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Dependencies</h2>
          <button
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.65} color="currentColor" />
            Add Dependency
          </button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Depends On */}
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                Depends On ({app.dependencies.length})
              </h3>
              {app.dependencies.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>No outgoing dependencies</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {app.dependencies.map((dep) => {
                    const depCrit = CRITICALITY_COLORS[dep.targetApp.criticality] ?? CRITICALITY_COLORS.LOW;
                    return (
                      <Link
                        key={dep.id}
                        href={`/dashboard/applications/${dep.targetApp.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: depCrit.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{dep.targetApp.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: '#eff6ff', color: DEPENDENCY_TYPE_COLORS[dep.dependencyType] ?? '#6b7280' }}>
                          {dep.dependencyType.replace('_', ' ')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Depended On By */}
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                Depended On By ({app.dependents.length})
              </h3>
              {app.dependents.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>No incoming dependencies</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {app.dependents.map((dep) => {
                    const depCrit = CRITICALITY_COLORS[dep.sourceApp.criticality] ?? CRITICALITY_COLORS.LOW;
                    return (
                      <Link
                        key={dep.id}
                        href={`/dashboard/applications/${dep.sourceApp.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: depCrit.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{dep.sourceApp.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: '#fff7ed', color: '#ea580c' }}>
                          {dep.dependencyType.replace('_', ' ')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Documents */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon path={mdiFileDocument} size={0.85} color="#059669" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>
            Documents ({app.documents.length})
          </h2>
          <button
            onClick={() => setShowAddDoc((v) => !v)}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.65} color="currentColor" />
            Add Document
          </button>
        </div>
        <div style={{ padding: 18 }}>
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
            <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>No documents attached yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: showAddDoc ? 12 : 0 }}>
              {app.documents.map((doc) => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <Icon path={mdiFileDocument} size={0.9} color="#6b7280" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: doc.description ? 3 : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{doc.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: '#eff6ff', color: '#3b82f6' }}>
                        {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                      </span>
                    </div>
                    {doc.description && <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{doc.description}</p>}
                  </div>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4f46e5', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    <Icon path={mdiOpenInNew} size={0.7} color="currentColor" />
                    Open
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Assets */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon path={mdiDesktopClassic} size={0.85} color="#d97706" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>
            Linked Assets ({app.applicationAssets.length})
          </h2>
          <button
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.65} color="currentColor" />
            Link Asset
          </button>
        </div>
        <div style={{ padding: 18 }}>
          {app.applicationAssets.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>No assets linked yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {app.applicationAssets.map((aa) => (
                <div key={aa.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <Icon path={mdiDesktopClassic} size={0.8} color="#d97706" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>
                    {aa.asset.assetTag}
                    {(aa.asset.manufacturer ?? aa.asset.model) && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7280' }}>
                        {[aa.asset.manufacturer, aa.asset.model].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: '#fff7ed', color: '#ea580c' }}>
                    {aa.relationshipType}
                  </span>
                  {aa.isPrimary && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, backgroundColor: '#fef3c7', color: '#92400e' }}>Primary</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 5: Activity Trail */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon path={mdiHistory} size={0.85} color="#6b7280" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>Activity Trail</h2>
        </div>
        <div style={{ padding: '12px 18px' }}>
          {app.activities.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>No activity recorded yet</p>
          ) : (
            <div style={{ position: 'relative' }}>
              {app.activities.map((act, idx) => (
                <div key={act.id} style={{ display: 'flex', gap: 12, paddingBottom: 12, position: 'relative' }}>
                  {/* Timeline line */}
                  {idx < app.activities.length - 1 && (
                    <div style={{ position: 'absolute', left: 10, top: 22, bottom: 0, width: 2, backgroundColor: '#e5e7eb' }} />
                  )}
                  {/* Dot */}
                  <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#e5e7eb', border: '2px solid #d1d5db', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#9ca3af' }} />
                  </div>
                  <div style={{ flex: 1, paddingTop: 2 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{act.actor?.name ?? 'System'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 8, backgroundColor: '#f3f4f6', color: '#6b7280' }}>{act.activityType}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{timeAgo(act.createdAt)}</span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>{act.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
