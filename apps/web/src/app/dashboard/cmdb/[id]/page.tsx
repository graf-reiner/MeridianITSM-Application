'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Icon from '@mdi/react';
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
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CIRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  source: { id: string; name: string; type: string; status: string; ciNumber: string };
  target: { id: string; name: string; type: string; status: string; ciNumber: string };
}

interface ChangeRecord {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
}

interface TicketLink {
  id: string;
  ticket: { id: string; ticketNumber: string; title: string; status: string };
}

interface CIDetail {
  id: string;
  ciNumber: string;
  name: string;
  type: string;
  status: string;
  environment: string | null;
  attributesJson: Record<string, unknown> | null;
  category: { name: string } | null;
  owner: { firstName: string; lastName: string } | null;
  site: { name: string } | null;
  asset: { assetTag: string; id: string } | null;
  sourceRelations?: CIRelation[];
  targetRelations?: CIRelation[];
  sourceRels?: CIRelation[];
  targetRels?: CIRelation[];
  changeHistory: ChangeRecord[];
  ticketLinks: TicketLink[];
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

// ─── Dynamic ReactFlow Import (SSR safe) ─────────────────────────────────────

const RelationshipMap = dynamic(() => import('./RelationshipMap'), { ssr: false, loading: () => (
  <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
    Loading relationship map...
  </div>
) });

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

function getStatusStyle(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'ACTIVE':        return { bg: 'var(--badge-green-bg)', text: '#065f46', border: '#16a34a' };
    case 'MAINTENANCE':   return { bg: 'var(--badge-yellow-bg)', text: '#92400e', border: '#d97706' };
    case 'INACTIVE':      return { bg: 'var(--bg-tertiary)', text: '#6b7280', border: '#9ca3af' };
    case 'DECOMMISSIONED': return { bg: 'var(--badge-red-bg)', text: '#991b1b', border: '#dc2626' };
    default:              return { bg: 'var(--bg-tertiary)', text: '#374151', border: 'var(--border-secondary)' };
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Active Tab ───────────────────────────────────────────────────────────────

type Tab = 'details' | 'map' | 'history' | 'tickets';

// ─── CMDB CI Detail Page ──────────────────────────────────────────────────────

export default function CMDBDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [impactData, setImpactData] = useState<ImpactCI[] | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [mapDepth, setMapDepth] = useState(2);

  const { data: ci, isLoading, error } = useQuery<CIDetail>({
    queryKey: ['cmdb-ci', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cmdb/cis/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load CI: ${res.status}`);
      return res.json() as Promise<CIDetail>;
    },
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

  const clearImpact = () => setImpactData(null);

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading CI...</div>;
  }
  if (error || !ci) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
      {error instanceof Error ? error.message : 'CI not found'}
    </div>;
  }

  const statusStyle = getStatusStyle(ci.status);
  const typeIcon = getCITypeIcon(ci.type);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'details', label: 'Details', icon: mdiCog },
    { key: 'map', label: 'Relationship Map', icon: mdiLanConnect },
    { key: 'history', label: 'Change History', icon: mdiHistory },
    { key: 'tickets', label: `Linked Tickets (${ci.ticketLinks.length})`, icon: mdiTicket },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Back + Header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 12 }}
        >
          <Icon path={mdiArrowLeft} size={0.8} color="currentColor" />
          Back to CMDB
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon path={typeIcon} size={1} color="var(--accent-primary)" />
              {ci.name}
            </h1>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>CI-{ci.ciNumber}</span>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, backgroundColor: statusStyle.bg, color: statusStyle.text }}>
                {ci.status}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>{ci.type.replace(/_/g, ' ')}</span>
              {ci.environment && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 10 }}>
                  {ci.environment}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-primary)', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {tabs.map((tab) => (
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

      {/* ── Tab: Details ──────────────────────────────────────────────────────── */}
      {activeTab === 'details' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Configuration Item Info</h2>
            {[
              ['Category', ci.category?.name],
              ['Owner', ci.owner ? `${ci.owner.firstName} ${ci.owner.lastName}` : null],
              ['Site', ci.site?.name],
              ['Linked Asset', ci.asset ? ci.asset.assetTag : null],
              ['Created', formatDateTime(ci.createdAt)],
              ['Updated', formatDateTime(ci.updatedAt)],
            ].map(([label, value]) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>{label}</span>
                <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>
                  {label === 'Linked Asset' && ci.asset ? (
                    <Link href={`/dashboard/assets/${ci.asset.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>
                      {ci.asset.assetTag}
                    </Link>
                  ) : ((value as string | null | undefined) ?? '—')}
                </span>
              </div>
            ))}
          </div>

          {ci.attributesJson && Object.keys(ci.attributesJson).length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 20 }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Attributes</h2>
              {Object.entries(ci.attributesJson).map(([key, value]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-tertiary)', fontSize: 14 }}>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8, textTransform: 'capitalize' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span style={{ color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>
                    {String(value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Relationship Map ──────────────────────────────────────────────── */}
      {activeTab === 'map' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Depth:</span>
              <select
                value={mapDepth}
                onChange={(e) => { setMapDepth(Number(e.target.value)); setImpactData(null); }}
                style={{ padding: '6px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}
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
                onClick={clearImpact}
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

          <div style={{ height: 500, border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden', backgroundColor: 'var(--bg-secondary)' }}>
            <RelationshipMap
              ci={ci}
              impactData={impactData}
            />
          </div>

          {impactData !== null && impactData.length > 0 && (
            <div style={{ marginTop: 12, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 12 }}>
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
        </div>
      )}

      {/* ── Tab: Change History ────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div>
          {ci.changeHistory.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
              No change history recorded
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {ci.changeHistory.map((record, idx) => (
                <div
                  key={record.id}
                  style={{
                    display: 'flex',
                    gap: 16,
                    padding: '12px 0',
                    borderBottom: idx < ci.changeHistory.length - 1 ? '1px solid var(--bg-tertiary)' : 'none',
                  }}
                >
                  <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--accent-primary)', marginTop: 6 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {record.fieldName.replace(/_/g, ' ')} changed
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-placeholder)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(record.createdAt)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ backgroundColor: 'var(--badge-red-bg)', color: '#991b1b', padding: '1px 6px', borderRadius: 4 }}>
                        {record.oldValue ?? '(empty)'}
                      </span>
                      <span>→</span>
                      <span style={{ backgroundColor: 'var(--badge-green-bg)', color: '#065f46', padding: '1px 6px', borderRadius: 4 }}>
                        {record.newValue ?? '(empty)'}
                      </span>
                      {record.changedBy && (
                        <span style={{ color: 'var(--text-placeholder)', marginLeft: 4 }}>
                          by {record.changedBy.firstName} {record.changedBy.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Linked Tickets ────────────────────────────────────────────────── */}
      {activeTab === 'tickets' && (
        <div>
          {ci.ticketLinks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>
              No tickets linked to this CI
            </div>
          ) : (
            <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Ticket #</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Title</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ci.ticketLinks.map((link) => (
                    <tr key={link.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/dashboard/tickets/${link.ticket.id}`}
                          style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                        >
                          {link.ticket.ticketNumber}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <Link
                          href={`/dashboard/tickets/${link.ticket.id}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {link.ticket.title}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: '#374151' }}>
                          {link.ticket.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
