'use client';

import { use } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiCloudUpload } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';

type Status = 'PENDING' | 'DOWNLOADING' | 'INSTALLING' | 'SUCCESS' | 'ERROR';

interface DeploymentTarget {
  id: string;
  agentId: string;
  hostname: string;
  platform: string;
  agentCurrentVersion: string | null;
  agentStatus: string;
  agentLastHeartbeatAt: string | null;
  fromVersion: string | null;
  toVersion: string;
  status: Status;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface DeploymentDetail {
  id: string;
  createdAt: string;
  platform: string;
  targetKind: string;
  version: string;
  fileSize: number;
  targetCount: number;
  successCount: number;
  errorCount: number;
  pendingCount: number;
  triggeredBy: { email: string; name: string } | null;
  targets: DeploymentTarget[];
}

const STATUS_COLORS: Record<Status, { bg: string; color: string }> = {
  PENDING:     { bg: 'var(--badge-yellow-bg)', color: '#92400e' },
  DOWNLOADING: { bg: 'var(--badge-indigo-bg)', color: '#4338ca' },
  INSTALLING:  { bg: 'var(--badge-indigo-bg)', color: '#4338ca' },
  SUCCESS:     { bg: 'var(--badge-green-bg)',  color: '#065f46' },
  ERROR:       { bg: 'var(--badge-red-bg)',    color: '#991b1b' },
};

export default function DeploymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading, error } = useQuery<DeploymentDetail>({
    queryKey: ['agent-deployment-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/agent-updates/deployments/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<DeploymentDetail>;
    },
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d && d.pendingCount === 0) return false;
      return 10000;
    },
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Link
          href="/dashboard/settings/agent-updates"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiCloudUpload} size={1} color="#4f46e5" />
          Deployment {data ? `v${data.version} (${data.platform})` : ''}
        </h1>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : error ? (
        <div style={{ padding: 20, color: '#dc2626' }}>{(error as Error).message}</div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Triggered', value: new Date(data.createdAt).toLocaleString() },
              { label: 'Triggered by', value: data.triggeredBy?.email ?? '—' },
              { label: 'Targets', value: String(data.targetCount) },
              { label: 'Success', value: String(data.successCount), color: '#065f46' },
              { label: 'Pending', value: String(data.pendingCount), color: '#92400e' },
              { label: 'Errors', value: String(data.errorCount), color: '#991b1b' },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-placeholder)', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: c.color ?? 'var(--text-primary)' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Targets table */}
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Hostname</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>From</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>To</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Started</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Completed</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {data.targets.map((t) => {
                  const s = STATUS_COLORS[t.status] ?? { bg: 'var(--bg-tertiary)', color: '#6b7280' };
                  // A PENDING target won't progress until the agent heartbeats.
                  // Flag it as STALE if we haven't heard from the agent in >24h.
                  const STALE_MS = 24 * 60 * 60 * 1000;
                  const lastBeat = t.agentLastHeartbeatAt ? new Date(t.agentLastHeartbeatAt).getTime() : null;
                  const isPendingState = t.status === 'PENDING' || t.status === 'DOWNLOADING' || t.status === 'INSTALLING';
                  const isStale = isPendingState && (lastBeat === null || Date.now() - lastBeat > STALE_MS);
                  const staleHours = lastBeat ? Math.floor((Date.now() - lastBeat) / 3600000) : null;
                  return (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <Link
                          href={`/dashboard/settings/agents/${t.agentId}`}
                          style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {t.hostname}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {t.fromVersion ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>{t.toVersion}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: 9999,
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor: s.bg,
                              color: s.color,
                            }}
                          >
                            {t.status}
                          </span>
                          {isStale && (
                            <span
                              title={
                                lastBeat
                                  ? `Agent last heartbeat ${staleHours}h ago — update won't apply until it checks in.`
                                  : `Agent has never heartbeated — update won't apply until it checks in.`
                              }
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: 9999,
                                fontSize: 11,
                                fontWeight: 700,
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                              }}
                            >
                              STALE{lastBeat && staleHours !== null ? ` · ${staleHours}h` : ''}
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                        {t.startedAt ? new Date(t.startedAt).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                        {t.completedAt ? new Date(t.completedAt).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#991b1b', fontSize: 13, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.errorMessage ?? ''}>
                        {t.errorMessage ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
