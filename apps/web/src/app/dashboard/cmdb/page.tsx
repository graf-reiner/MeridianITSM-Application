'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
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
  mdiPlus,
  mdiUpload,
  mdiMagnify,
  mdiFilter,
  mdiHeartPulse,
  mdiTune,
  mdiCircleSmall,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CiClass {
  id: string;
  classKey: string;
  className: string;
  icon: string | null;
}

interface CiStatus {
  id: string;
  statusKey: string;
  statusName: string;
}

interface CiEnvironment {
  id: string;
  envKey: string;
  envName: string;
}

interface CI {
  id: string;
  ciNumber: string;
  name: string;
  hostname: string | null;
  type: string;
  status: string;
  environment: string | null;
  criticality: string | null;
  lastVerifiedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  category: { name: string } | null;
  ciClass: CiClass | null;
  lifecycleStatus: CiStatus | null;
  operationalStatus: CiStatus | null;
  cmdbEnvironment: CiEnvironment | null;
  manufacturer: { id: string; name: string } | null;
  supportGroup: { id: string; name: string } | null;
}

interface CIListResponse {
  data: CI[];
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCITypeIcon(type: string): string {
  switch (type) {
    case 'SERVER':         return mdiServer;
    case 'WORKSTATION':    return mdiDesktopClassic;
    case 'NETWORK_DEVICE': return mdiLanConnect;
    case 'DATABASE':       return mdiDatabase;
    case 'CLOUD_RESOURCE': return mdiCloud;
    case 'SERVICE':        return mdiCog;
    case 'APPLICATION':    return mdiApplication;
    case 'SECURITY_DEVICE':return mdiShieldLock;
    case 'STORAGE':        return mdiPackageVariant;
    default:               return mdiServer;
  }
}

function getLifecycleStatusStyle(statusKey: string | undefined): { bg: string; text: string } {
  switch (statusKey) {
    case 'in_service':   return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'under_change': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'retired':      return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
    case 'planned':      return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'installed':    return { bg: 'var(--badge-purple-bg-subtle)', text: '#6b21a8' };
    default:             return { bg: 'var(--bg-tertiary)', text: '#374151' };
  }
}

function getOperationalStatusStyle(statusKey: string | undefined): { bg: string; text: string } {
  switch (statusKey) {
    case 'online':      return { bg: 'var(--badge-green-bg)', text: '#065f46' };
    case 'offline':     return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'degraded':    return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'maintenance': return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    default:            return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
  }
}

function getEnvStyle(envKey: string | undefined): { bg: string; text: string } {
  switch (envKey) {
    case 'prod': return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    case 'test': return { bg: 'var(--badge-yellow-bg)', text: '#92400e' };
    case 'dev':  return { bg: 'var(--badge-blue-bg)', text: '#1e40af' };
    case 'qa':   return { bg: 'var(--badge-purple-bg-subtle)', text: '#6b21a8' };
    case 'dr':   return { bg: 'var(--badge-red-bg)', text: '#991b1b' };
    default:     return { bg: 'var(--bg-tertiary)', text: '#6b7280' };
  }
}

function getStalenessIndicator(lastVerifiedAt: string | null, lastSeenAt: string | null): { color: string; label: string } {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const latest = Math.max(
    lastVerifiedAt ? new Date(lastVerifiedAt).getTime() : 0,
    lastSeenAt ? new Date(lastSeenAt).getTime() : 0,
  );
  if (latest === 0) return { color: '#ef4444', label: 'Never verified' };
  const age = now - latest;
  if (age < thirtyDays * 0.7) return { color: '#22c55e', label: 'Fresh' };
  if (age < thirtyDays) return { color: '#eab308', label: 'Approaching stale' };
  return { color: '#ef4444', label: 'Stale' };
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── CMDB CI List Page ────────────────────────────────────────────────────────

export default function CMDBPage() {
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [lifecycleStatusId, setLifecycleStatusId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [criticality, setCriticality] = useState('');
  const [staleness, setStaleness] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Fetch reference data for filters
  const { data: classes } = useQuery<CiClass[]>({
    queryKey: ['cmdb-classes'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/classes', { credentials: 'include' });
      return res.json();
    },
  });

  const { data: statuses } = useQuery<CiStatus[]>({
    queryKey: ['cmdb-statuses-lifecycle'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/statuses?statusType=lifecycle', { credentials: 'include' });
      return res.json();
    },
  });

  const { data: environments } = useQuery<CiEnvironment[]>({
    queryKey: ['cmdb-environments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/environments', { credentials: 'include' });
      return res.json();
    },
  });

  const { data, isLoading, error } = useQuery<CIListResponse>({
    queryKey: ['cmdb-cis', search, classId, lifecycleStatusId, environmentId, criticality, staleness, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (classId) params.set('classId', classId);
      if (lifecycleStatusId) params.set('lifecycleStatusId', lifecycleStatusId);
      if (environmentId) params.set('environmentId', environmentId);
      if (criticality) params.set('criticality', criticality);
      if (staleness) params.set('staleness', staleness);
      const res = await fetch(`/api/v1/cmdb/cis?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Failed to load CIs: ${res.status}`);
      return res.json();
    },
  });

  const cis = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiDatabase} size={1} color="var(--accent-primary)" />
          CMDB — Configuration Items
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/dashboard/cmdb/health"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', textDecoration: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1px solid var(--border-secondary)',
            }}
          >
            <Icon path={mdiHeartPulse} size={0.8} color="currentColor" />
            Health
          </Link>
          <Link
            href="/dashboard/cmdb/settings"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', textDecoration: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1px solid var(--border-secondary)',
            }}
          >
            <Icon path={mdiTune} size={0.8} color="currentColor" />
            Settings
          </Link>
          <Link
            href="/dashboard/cmdb/import"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', textDecoration: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1px solid var(--border-secondary)',
            }}
          >
            <Icon path={mdiUpload} size={0.8} color="currentColor" />
            Import
          </Link>
          <Link
            href="/dashboard/cmdb/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)', textDecoration: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600,
            }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New CI
          </Link>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon path={mdiMagnify} size={0.8} color="var(--text-placeholder)" />
          </div>
          <input
            type="search"
            placeholder="Search by name, hostname, FQDN, IP..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '8px 10px 8px 34px', border: '1px solid var(--border-secondary)',
              borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon path={mdiFilter} size={0.75} color="var(--text-placeholder)" />
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }}
            style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
            <option value="">All Classes</option>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}
          </select>
        </div>

        <select value={lifecycleStatusId} onChange={(e) => { setLifecycleStatusId(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Statuses</option>
          {(statuses ?? []).map((s) => <option key={s.id} value={s.id}>{s.statusName}</option>)}
        </select>

        <select value={environmentId} onChange={(e) => { setEnvironmentId(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Environments</option>
          {(environments ?? []).map((e) => <option key={e.id} value={e.id}>{e.envName}</option>)}
        </select>

        <select value={criticality} onChange={(e) => { setCriticality(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Criticality</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="mission_critical">Mission Critical</option>
        </select>

        <select value={staleness} onChange={(e) => { setStaleness(e.target.value); setPage(1); }}
          style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Health</option>
          <option value="fresh">Fresh</option>
          <option value="stale">Stale</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading CIs...</div>
      ) : error ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-danger)' }}>
          {error instanceof Error ? error.message : 'Failed to load CIs'}
        </div>
      ) : cis.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiDatabase} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No configuration items found</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: 32 }}></th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>CI #</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Class</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Lifecycle</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Operational</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Environment</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Criticality</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {cis.map((ci) => {
                const lifecycleStyle = getLifecycleStatusStyle(ci.lifecycleStatus?.statusKey);
                const operationalStyle = getOperationalStatusStyle(ci.operationalStatus?.statusKey);
                const envStyle = getEnvStyle(ci.cmdbEnvironment?.envKey);
                const healthIndicator = getStalenessIndicator(ci.lastVerifiedAt, ci.lastSeenAt);
                return (
                  <tr key={ci.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 6px 10px 14px', whiteSpace: 'nowrap' }} title={healthIndicator.label}>
                      <Icon path={mdiCircleSmall} size={1} color={healthIndicator.color} />
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <Link href={`/dashboard/cmdb/${ci.id}`}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
                        CI-{ci.ciNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/dashboard/cmdb/${ci.id}`}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {ci.name}
                      </Link>
                      {ci.hostname && ci.hostname !== ci.name && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ci.hostname}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {ci.ciClass ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 13 }}>
                          {ci.ciClass.className}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{ci.type.replace(/_/g, ' ')}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {ci.lifecycleStatus ? (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: lifecycleStyle.bg, color: lifecycleStyle.text }}>
                          {ci.lifecycleStatus.statusName}
                        </span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: '#6b7280' }}>
                          {ci.status}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {ci.operationalStatus ? (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: operationalStyle.bg, color: operationalStyle.text }}>
                          {ci.operationalStatus.statusName}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {ci.cmdbEnvironment ? (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: envStyle.bg, color: envStyle.text }}>
                          {ci.cmdbEnvironment.envName}
                        </span>
                      ) : ci.environment ? (
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--bg-tertiary)', color: '#6b7280' }}>
                          {ci.environment}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {ci.criticality ? (
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500,
                          backgroundColor: ci.criticality === 'mission_critical' ? 'var(--badge-red-bg)' : ci.criticality === 'high' ? 'var(--badge-yellow-bg)' : 'var(--bg-tertiary)',
                          color: ci.criticality === 'mission_critical' ? '#991b1b' : ci.criticality === 'high' ? '#92400e' : '#6b7280',
                        }}>
                          {ci.criticality.replace(/_/g, ' ')}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-placeholder)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {relativeTime(ci.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}>
            Previous
          </button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} ({total} CIs)
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, backgroundColor: 'var(--bg-primary)', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
