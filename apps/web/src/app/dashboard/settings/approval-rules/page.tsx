'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiCheckDecagram, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalRule {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  conditions: unknown;
  approvers: unknown;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ApprovalRuleModal({ item, onClose, onSaved }: { item: ApprovalRule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [priority, setPriority] = useState(item?.priority ?? 1);
  const [conditionsJson, setConditionsJson] = useState(item?.conditions ? JSON.stringify(item.conditions, null, 2) : '{}');
  const [approversJson, setApproversJson] = useState(item?.approvers ? JSON.stringify(item.approvers, null, 2) : '[]');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      let parsedConditions: unknown;
      let parsedApprovers: unknown;
      try {
        parsedConditions = JSON.parse(conditionsJson);
      } catch {
        throw new Error('Conditions is not valid JSON');
      }
      try {
        parsedApprovers = JSON.parse(approversJson);
      } catch {
        throw new Error('Approvers is not valid JSON');
      }
      const res = await fetch(item ? `/api/v1/ticket-approval-rules/${item.id}` : '/api/v1/ticket-approval-rules', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          isActive,
          priority,
          conditions: parsedConditions,
          approvers: parsedApprovers,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save approval rule');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 560, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{item ? 'Edit Approval Rule' : 'Create Approval Rule'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <div style={{ flex: 1 }}>
              <label htmlFor="priority" style={labelStyle}>Priority</label>
              <input id="priority" type="number" min={1} value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 1)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="conditions" style={labelStyle}>Conditions (JSON)</label>
            <textarea id="conditions" value={conditionsJson} onChange={(e) => setConditionsJson(e.target.value)} rows={5} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="approvers" style={labelStyle}>Approvers (JSON)</label>
            <textarea id="approvers" value={approversJson} onChange={(e) => setApproversJson(e.target.value)} rows={5} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : item ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalRulesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<ApprovalRule | null>(null);

  const { data, isLoading } = useQuery<ApprovalRule[]>({
    queryKey: ['settings-approval-rules'],
    queryFn: async () => {
      const res = await fetch('/api/v1/ticket-approval-rules', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load approval rules');
      const json = await res.json();
      return Array.isArray(json) ? json : json.rules ?? json.data ?? [];
    },
  });

  const handleDelete = async (item: ApprovalRule) => {
    if (!window.confirm(`Delete approval rule "${item.name}"?`)) return;
    await fetch(`/api/v1/ticket-approval-rules/${item.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-approval-rules'] });
  };

  const items = data ?? [];

  const statusBadge = (active: boolean) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: active ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: active ? '#16a34a' : 'var(--text-muted)' }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiCheckDecagram} size={1} color="#10b981" />
          Approval Rules
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Rule
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Priority</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(item.isActive)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{item.priority}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditItem(item); setShowModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                        <Icon path={mdiPencil} size={0.65} color="currentColor" /> Edit
                      </button>
                      <button onClick={() => void handleDelete(item)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}>
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No approval rules found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ApprovalRuleModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-approval-rules'] })}
        />
      )}
    </div>
  );
}
