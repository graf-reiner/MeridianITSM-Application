'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiHistory, mdiCheckCircle, mdiAlertCircle, mdiClockOutline, mdiSkipNext, mdiChevronDown, mdiChevronUp } from '@mdi/js';

interface ExecutionStep {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Execution {
  id: string;
  trigger: string;
  status: string;
  eventPayload: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  isSimulation: boolean;
  workflow: { id: string; name: string; trigger: string };
  version: { version: number };
  steps: ExecutionStep[];
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  COMPLETED: { icon: mdiCheckCircle, color: '#16a34a', label: 'Completed' },
  FAILED: { icon: mdiAlertCircle, color: '#dc2626', label: 'Failed' },
  RUNNING: { icon: mdiClockOutline, color: '#f59e0b', label: 'Running' },
  SKIPPED: { icon: mdiSkipNext, color: '#6b7280', label: 'Skipped' },
};

interface NodeDefinitionDTO {
  type: string;
  category: string;
  label: string;
  notificationTrigger?: string;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'running...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function GlobalExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: nodeDefinitions = [] } = useQuery<NodeDefinitionDTO[]>({
    queryKey: ['workflow-node-definitions'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/workflows/node-definitions', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const triggerOptions = useMemo(
    () =>
      nodeDefinitions
        .filter(n => n.category === 'trigger' && n.notificationTrigger)
        .map(n => ({ value: n.notificationTrigger!, label: n.label })),
    [nodeDefinitions],
  );

  const triggerLabelByValue = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of triggerOptions) map[t.value] = t.label;
    return map;
  }, [triggerOptions]);

  const { data, isLoading } = useQuery<{ executions: Execution[]; total: number }>({
    queryKey: ['global-workflow-executions', statusFilter, triggerFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (statusFilter) params.set('status', statusFilter);
      if (triggerFilter) params.set('trigger', triggerFilter);
      const res = await fetch(`/api/v1/settings/workflows/executions?${params}`, { credentials: 'include' });
      if (!res.ok) return { executions: [], total: 0 };
      return res.json();
    },
  });

  const executions = data?.executions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Link href="/dashboard/settings/workflows" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiHistory} size={1} color="var(--accent-primary)" />
          Automation Activity
        </h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>({total} total runs)</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="RUNNING">Running</option>
        </select>
        <select value={triggerFilter} onChange={e => { setTriggerFilter(e.target.value); setPage(1); }} style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Triggers</option>
          {triggerOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : executions.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiHistory} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No automation activity yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {executions.map(exec => {
            const sc = STATUS_CONFIG[exec.status] ?? STATUS_CONFIG.RUNNING;
            const isExpanded = expandedId === exec.id;
            return (
              <div key={exec.id} style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', textAlign: 'left' }}
                >
                  <Icon path={sc.icon} size={0.8} color={sc.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link href={`/dashboard/settings/workflows/${exec.workflow.id}`} onClick={e => e.stopPropagation()} style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)', textDecoration: 'none' }}>
                        {exec.workflow.name}
                      </Link>
                      <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: `${sc.color}18`, color: sc.color }}>{sc.label}</span>
                      <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, backgroundColor: 'var(--badge-blue-bg)', color: '#1e40af' }}>
                        {triggerLabelByValue[exec.trigger] ?? exec.trigger}
                      </span>
                      {exec.isSimulation && <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: '#dbeafe', color: '#1e40af' }}>Simulation</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>{formatTime(exec.startedAt)}</span>
                      <span>Duration: {formatDuration(exec.startedAt, exec.completedAt)}</span>
                      <span>Steps: {exec.steps.length}</span>
                      <span>v{exec.version.version}</span>
                    </div>
                  </div>
                  <Icon path={isExpanded ? mdiChevronUp : mdiChevronDown} size={0.8} color="var(--text-muted)" />
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-primary)', padding: 16 }}>
                    {exec.error && (
                      <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
                        Error: {exec.error}
                      </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Node</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Duration</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Output</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exec.steps.map(step => {
                          const ssc = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.RUNNING;
                          return (
                            <tr key={step.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{step.nodeId}</td>
                              <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>{step.nodeType.replace(/_/g, ' ')}</td>
                              <td style={{ padding: '6px 10px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Icon path={ssc.icon} size={0.55} color={ssc.color} />
                                  <span style={{ fontSize: 12, color: ssc.color }}>{ssc.label}</span>
                                </span>
                              </td>
                              <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                                {step.startedAt && step.completedAt ? formatDuration(step.startedAt, step.completedAt) : '—'}
                              </td>
                              <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {step.error ? <span style={{ color: '#dc2626' }}>{step.error}</span> : step.outputData ? JSON.stringify(step.outputData).slice(0, 100) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {exec.eventPayload && (
                      <details style={{ marginTop: 12 }}>
                        <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>Event Payload</summary>
                        <pre style={{ fontSize: 11, backgroundColor: 'var(--bg-secondary)', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 200, marginTop: 6 }}>
                          {JSON.stringify(exec.eventPayload, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, backgroundColor: 'var(--bg-primary)' }}>Previous</button>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 14px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 14, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, backgroundColor: 'var(--bg-primary)' }}>Next</button>
        </div>
      )}
    </div>
  );
}
