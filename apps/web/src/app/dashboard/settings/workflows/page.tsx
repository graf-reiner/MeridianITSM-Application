'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiSitemap, mdiPlus, mdiPencil, mdiTrashCan, mdiPlay, mdiPause, mdiRocketLaunch, mdiHistory } from '@mdi/js';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  trigger: string;
  createdAt: string;
  updatedAt: string;
  versions: Array<{ id: string; version: number; createdAt: string }>;
  _count: { executions: number };
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: 'var(--badge-yellow-bg)', text: '#92400e' },
  PUBLISHED: { bg: 'var(--badge-green-bg)', text: '#065f46' },
  DISABLED: { bg: 'var(--bg-tertiary)', text: '#6b7280' },
};

const TRIGGER_LABELS: Record<string, string> = {
  TICKET_CREATED: 'Ticket Created',
  TICKET_UPDATED: 'Ticket Updated',
  TICKET_ASSIGNED: 'Ticket Assigned',
  TICKET_COMMENTED: 'Comment Added',
  TICKET_RESOLVED: 'Ticket Resolved',
  SLA_WARNING: 'SLA Warning',
  SLA_BREACH: 'SLA Breach',
  TICKET_APPROVAL_REQUESTED: 'Approval Requested',
};

export default function WorkflowsSettingsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('TICKET_CREATED');
  const [creating, setCreating] = useState(false);

  const { data: workflows = [], isLoading } = useQuery<Workflow[]>({
    queryKey: ['settings-workflows', statusFilter, triggerFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (triggerFilter) params.set('trigger', triggerFilter);
      const res = await fetch(`/api/v1/settings/workflows?${params}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/v1/settings/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ name: newName.trim(), trigger: newTrigger }),
    });
    if (res.ok) {
      const wf = await res.json();
      setShowCreateModal(false);
      setNewName('');
      void qc.invalidateQueries({ queryKey: ['settings-workflows'] });
      // Navigate to builder
      window.location.href = `/dashboard/settings/workflows/${wf.id}`;
    }
    setCreating(false);
  };

  const handleDelete = async (wf: Workflow) => {
    if (!window.confirm(`Disable workflow "${wf.name}"?`)) return;
    await fetch(`/api/v1/settings/workflows/${wf.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-workflows'] });
  };

  const handleDuplicate = async (wf: Workflow) => {
    // Fetch the full workflow with graph, then create a copy
    const res = await fetch(`/api/v1/settings/workflows/${wf.id}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const createRes = await fetch('/api/v1/settings/workflows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ name: `Copy of ${wf.name}`, trigger: wf.trigger, description: wf.description }),
    });
    if (createRes.ok) {
      const newWf = await createRes.json();
      // Save the graph from the original
      if (data.graph?.nodes?.length) {
        await fetch(`/api/v1/settings/workflows/${newWf.id}/graph`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ graph: data.graph }),
        });
      }
      void qc.invalidateQueries({ queryKey: ['settings-workflows'] });
    }
  };

  const handleToggle = async (wf: Workflow) => {
    const newStatus = wf.status === 'PUBLISHED' ? 'DISABLED' : 'PUBLISHED';
    if (newStatus === 'PUBLISHED') {
      await fetch(`/api/v1/settings/workflows/${wf.id}/publish`, { method: 'POST', credentials: 'include' });
    } else {
      await fetch(`/api/v1/settings/workflows/${wf.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
    }
    void qc.invalidateQueries({ queryKey: ['settings-workflows'] });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiSitemap} size={1} color="var(--accent-primary)" />
          Workflow Automation
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link href="/dashboard/settings/workflows/executions" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, fontWeight: 500, textDecoration: 'none', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
            <Icon path={mdiHistory} size={0.7} color="currentColor" />
            View All Activity
          </Link>
          <button onClick={() => setShowCreateModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Workflow
          </button>
        </div>
      </div>

      {/* Migration banner */}
      <div style={{ padding: '12px 16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1e40af' }}>Migrate from Notification Rules</span>
          <p style={{ fontSize: 13, color: '#3b82f6', margin: '4px 0 0' }}>Convert existing notification rules into workflow drafts for review.</p>
        </div>
        <button
          onClick={async () => {
            if (!window.confirm('Migrate all notification rules to draft workflows? Existing rules will NOT be affected.')) return;
            const res = await fetch('/api/v1/settings/workflows/migrate-from-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
            if (res.ok) {
              const data = await res.json();
              const msg = data.warnings?.length ? `Migrated ${data.migrated} rules with warnings:\n${data.warnings.join('\n')}` : `Migrated ${data.migrated} rules successfully!`;
              alert(msg);
              void qc.invalidateQueries({ queryKey: ['settings-workflows'] });
            }
          }}
          style={{ padding: '8px 16px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Migrate Rules
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <select value={triggerFilter} onChange={e => setTriggerFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 8, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>
          <option value="">All Triggers</option>
          {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : workflows.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Icon path={mdiSitemap} size={2.5} color="var(--border-secondary)" />
          <p style={{ margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>No workflows yet. Create your first workflow to automate ticket processes.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Trigger</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Version</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Runs</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map(wf => {
                const ss = STATUS_STYLES[wf.status] ?? STATUS_STYLES.DRAFT;
                return (
                  <tr key={wf.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <Link href={`/dashboard/settings/workflows/${wf.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {wf.name}
                      </Link>
                      {wf.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{wf.description}</div>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: 'var(--badge-blue-bg)', color: '#1e40af' }}>
                        {TRIGGER_LABELS[wf.trigger] ?? wf.trigger}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: ss.bg, color: ss.text }}>
                        {wf.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                      v{wf.versions[0]?.version ?? 0}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                      {wf._count.executions}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={`/dashboard/settings/workflows/${wf.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, textDecoration: 'none', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}>
                          <Icon path={mdiPencil} size={0.55} color="currentColor" /> Edit
                        </Link>
                        <button onClick={() => void handleToggle(wf)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: wf.status === 'PUBLISHED' ? '#dc2626' : '#059669' }}>
                          <Icon path={wf.status === 'PUBLISHED' ? mdiPause : mdiRocketLaunch} size={0.55} color="currentColor" />
                          {wf.status === 'PUBLISHED' ? 'Disable' : 'Publish'}
                        </button>
                        <button onClick={() => void handleDuplicate(wf)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                          Duplicate
                        </button>
                        <button onClick={() => void handleDelete(wf)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}>
                          <Icon path={mdiTrashCan} size={0.55} color="currentColor" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700 }}>Create Workflow</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Name *</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. High Priority Routing" style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Trigger Event *</label>
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, boxSizing: 'border-box' }}>
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)' }}>Cancel</button>
              <button onClick={() => void handleCreate()} disabled={creating || !newName.trim()} style={{ padding: '8px 18px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {creating ? 'Creating...' : 'Create & Open Builder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
