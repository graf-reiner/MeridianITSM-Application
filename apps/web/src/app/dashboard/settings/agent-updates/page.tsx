'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiCloudUpload, mdiChevronRight } from '@mdi/js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface DeploymentRow {
  id: string;
  createdAt: string;
  platform: 'WINDOWS' | 'LINUX' | 'MACOS';
  targetKind: 'ALL' | 'SINGLE' | 'SELECTION';
  version: string;
  targetCount: number;
  successCount: number;
  errorCount: number;
  pendingCount: number;
  awaitingApproval?: boolean;
  change?: { id: string; changeNumber: number; status: string; type: string } | null;
  triggeredBy: { email: string; name: string } | null;
}

interface AgentPolicy {
  agentUpdatePolicy: 'manual' | 'auto' | 'scheduled';
  agentUpdateWindowStart: string | null;
  agentUpdateWindowEnd: string | null;
  agentUpdateWindowDay: string | null;
  agentDeployRequiresChange: boolean;
}

interface DeploymentListResponse {
  data: DeploymentRow[];
  total: number;
  page: number;
  pageSize: number;
}

function StatusPill({ label, count, bg, color }: { label: string; count: number; bg: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: bg,
        color,
      }}
    >
      {count} {label}
    </span>
  );
}

export default function AgentUpdatesHistoryPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<DeploymentListResponse>({
    queryKey: ['agent-deployments', page, pageSize],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/settings/agent-updates/deployments?page=${page}&pageSize=${pageSize}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<DeploymentListResponse>;
    },
    refetchInterval: 10000,
  });

  const { data: policy } = useQuery<AgentPolicy>({
    queryKey: ['agent-policy'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/agents/policy', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<AgentPolicy>;
    },
  });

  const togglePolicy = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await fetch('/api/v1/settings/agents/policy', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentDeployRequiresChange: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<AgentPolicy>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-policy'] }),
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Link
          href="/dashboard/settings/agents"
          style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiCloudUpload} size={1} color="#4f46e5" />
          Agent Update Deployments
        </h1>
      </div>
      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14 }}>
        History of every agent update push. Rows refresh every 10 seconds so in-progress deploys update automatically.
      </p>

      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
            Require change approval for agent deployments
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            When enabled, every agent-update deploy creates a NORMAL change ticket and waits for approval before agents
            receive the update. When disabled, deploys proceed immediately and a STANDARD (audit-trail) change is
            recorded after the fact.
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={policy?.agentDeployRequiresChange ?? false}
            disabled={!policy || togglePolicy.isPending}
            onChange={(e) => togglePolicy.mutate(e.target.checked)}
            style={{ marginRight: 8, transform: 'scale(1.2)' }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {policy?.agentDeployRequiresChange ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 20, color: '#dc2626' }}>{(error as Error).message}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No deployments yet. Trigger a deploy from the Agents page to see history here.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Triggered</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Version</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Platform</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Scope</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Targets</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Change</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Triggered By</th>
                <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>v{r.version}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{r.platform}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                    {r.targetKind === 'ALL' ? 'All agents' : r.targetKind === 'SINGLE' ? 'Single system' : 'Selection'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{r.targetCount}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.awaitingApproval && (
                        <StatusPill label="awaiting approval" count={0} bg="var(--badge-yellow-bg)" color="#92400e" />
                      )}
                      {!r.awaitingApproval && r.successCount > 0 && (
                        <StatusPill label="ok" count={r.successCount} bg="var(--badge-green-bg)" color="#065f46" />
                      )}
                      {!r.awaitingApproval && r.pendingCount > 0 && (
                        <StatusPill label="pending" count={r.pendingCount} bg="var(--badge-yellow-bg)" color="#92400e" />
                      )}
                      {r.errorCount > 0 && (
                        <StatusPill label="error" count={r.errorCount} bg="var(--badge-red-bg)" color="#991b1b" />
                      )}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>
                    {r.change ? (
                      <Link
                        href={`/dashboard/changes/${r.change.id}`}
                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontFamily: 'monospace' }}
                      >
                        CHG-{r.change.changeNumber}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                    {r.change && (
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                        {r.change.type} · {r.change.status}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                    {r.triggeredBy?.email ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <Link
                      href={`/dashboard/settings/agent-updates/${r.id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        color: 'var(--accent-primary)',
                        textDecoration: 'none',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      View <Icon path={mdiChevronRight} size={0.7} color="currentColor" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page} of {pageCount} · {total} deployments
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 6,
                fontSize: 13,
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
                padding: '6px 12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 6,
                fontSize: 13,
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
