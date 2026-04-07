'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiEscalatorUp, mdiPlus, mdiPencil, mdiTrashCan, mdiClose } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EscalationLevel {
  level: number;
  afterMinutes: number;
  action: 'notify' | 'reassign' | 'escalate_queue';
  targetId?: string;
}

interface EscalationPolicy {
  id: string;
  name: string;
  isActive: boolean;
  levels: EscalationLevel[];
}

// ─── Level Editor ─────────────────────────────────────────────────────────────

function LevelEditor({ levels, onChange }: { levels: EscalationLevel[]; onChange: (levels: EscalationLevel[]) => void }) {
  const inputStyle = { width: '100%', padding: '6px 8px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };

  const addLevel = () => {
    onChange([...levels, { level: levels.length + 1, afterMinutes: 30, action: 'notify' }]);
  };

  const removeLevel = (index: number) => {
    const updated = levels.filter((_, i) => i !== index).map((l, i) => ({ ...l, level: i + 1 }));
    onChange(updated);
  };

  const updateLevel = (index: number, field: string, value: unknown) => {
    const updated = levels.map((l, i) => i === index ? { ...l, [field]: value } : l);
    onChange(updated);
  };

  return (
    <div>
      {levels.map((level, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 16 }}>L{level.level}</span>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>After (min)</label>
            <input type="number" min={1} value={level.afterMinutes} onChange={(e) => updateLevel(idx, 'afterMinutes', parseInt(e.target.value) || 1)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Action</label>
            <select value={level.action} onChange={(e) => updateLevel(idx, 'action', e.target.value)} style={inputStyle}>
              <option value="notify">Notify</option>
              <option value="reassign">Reassign</option>
              <option value="escalate_queue">Escalate to Queue</option>
            </select>
          </div>
          <button type="button" onClick={() => removeLevel(idx)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', marginTop: 14 }}>
            <Icon path={mdiClose} size={0.7} color="currentColor" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addLevel} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: '1px dashed var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--text-secondary)' }}>
        <Icon path={mdiPlus} size={0.6} color="currentColor" /> Add Level
      </button>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function PolicyModal({ item, onClose, onSaved }: { item: EscalationPolicy | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [levels, setLevels] = useState<EscalationLevel[]>(item?.levels ?? [{ level: 1, afterMinutes: 30, action: 'notify' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(item ? `/api/v1/escalation-policies/${item.id}` : '/api/v1/escalation-policies', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), isActive, levels }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save policy');
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
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{item ? 'Edit Escalation Policy' : 'Create Escalation Policy'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Escalation Levels</label>
            <LevelEditor levels={levels} onChange={setLevels} />
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

export default function EscalationPoliciesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<EscalationPolicy | null>(null);

  const { data, isLoading } = useQuery<EscalationPolicy[]>({
    queryKey: ['settings-escalation-policies'],
    queryFn: async () => {
      const res = await fetch('/api/v1/escalation-policies', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load escalation policies');
      const json = await res.json();
      return Array.isArray(json) ? json : json.policies ?? json.data ?? [];
    },
  });

  const handleDelete = async (item: EscalationPolicy) => {
    if (!window.confirm(`Delete escalation policy "${item.name}"?`)) return;
    await fetch(`/api/v1/escalation-policies/${item.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-escalation-policies'] });
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
          <Icon path={mdiEscalatorUp} size={1} color="#f59e0b" />
          Escalation Policies
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Policy
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
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Levels</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(item.isActive)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{item.levels?.length ?? 0} level{(item.levels?.length ?? 0) !== 1 ? 's' : ''}</td>
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
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No escalation policies found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <PolicyModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-escalation-policies'] })}
        />
      )}
    </div>
  );
}
