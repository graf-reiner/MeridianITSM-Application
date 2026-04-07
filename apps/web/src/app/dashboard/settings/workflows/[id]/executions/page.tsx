'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiHistory, mdiChevronDown, mdiChevronUp, mdiCheckCircle, mdiAlertCircle, mdiClockOutline, mdiSkipNext } from '@mdi/js';

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
  version: { version: number };
  steps: ExecutionStep[];
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  COMPLETED: { icon: mdiCheckCircle, color: '#16a34a', label: 'Completed' },
  FAILED: { icon: mdiAlertCircle, color: '#dc2626', label: 'Failed' },
  RUNNING: { icon: mdiClockOutline, color: '#f59e0b', label: 'Running' },
  SKIPPED: { icon: mdiSkipNext, color: '#6b7280', label: 'Skipped' },
};

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

export default function WorkflowExecutionsPage() {
  const params = useParams();
  const workflowId = params.id as string;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ executions: Execution[]; total: number }>({
    queryKey: ['workflow-executions', workflowId, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/workflows/${workflowId}/executions?page=${page}&pageSize=20`, { credentials: 'include' });
      if (!res.ok) return { executions: [], total: 0 };
      return res.json();
    },
  });

  const executions = data?.executions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Link href={`/dashboard/settings/workflows/${workflowId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiHistory} size={1} color="var(--accent-primary)" />
          Execution History
        </h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>({total} runs)</span>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : executions.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiHistory} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No executions yet. Publish your workflow and trigger it to see runs here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {executions.map(exec => {
            const sc = STATUS_CONFIG[exec.status] ?? STATUS_CONFIG.RUNNING;
            const isExpanded = expandedId === exec.id;
            return (
              <div key={exec.id} style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', textAlign: 'left' }}
                >
                  <Icon path={sc.icon} size={0.8} color={sc.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{formatTime(exec.startedAt)}</span>
                      <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: `${sc.color}18`, color: sc.color }}>{sc.label}</span>
                      {exec.isSimulation && <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, backgroundColor: '#dbeafe', color: '#1e40af' }}>Simulation</span>}
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v{exec.version.version}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>Duration: {formatDuration(exec.startedAt, exec.completedAt)}</span>
                      <span>Steps: {exec.steps.length}</span>
                      <span>Trigger: {exec.trigger}</span>
                    </div>
                  </div>
                  <Icon path={isExpanded ? mdiChevronUp : mdiChevronDown} size={0.8} color="var(--text-muted)" />
                </button>

                {/* Expanded step details */}
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
                              <td style={{ padding: '6px 10px' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step.nodeType.replace(/_/g, ' ')}</span>
                              </td>
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

                    {/* Event payload */}
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

      {/* Pagination */}
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
