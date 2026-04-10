'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiTextBoxMultiple, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';
import { VariableTextarea } from '@/components/variable-picker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CannedResponse {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  visibility: 'PERSONAL' | 'TEAM' | 'GLOBAL';
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function CannedResponseModal({ item, onClose, onSaved }: { item: CannedResponse | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [content, setContent] = useState(item?.content ?? '');
  const [shortcut, setShortcut] = useState(item?.shortcut ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [visibility, setVisibility] = useState<string>(item?.visibility ?? 'PERSONAL');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(item ? `/api/v1/canned-responses/${item.id}` : '/api/v1/canned-responses', {
        method: item ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          shortcut: shortcut.trim() || null,
          category: category.trim() || null,
          visibility,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save canned response');
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
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 540, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{item ? 'Edit Canned Response' : 'Create Canned Response'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="title" style={labelStyle}>Title *</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="content" style={labelStyle}>Content *</label>
            <VariableTextarea
              id="content"
              value={content}
              onChange={setContent}
              context={['ticket', 'requester', 'assignee', 'tenant', 'now']}
              placeholder="Type / to insert a variable like {{requester.firstName}} or {{ticket.number}}"
              rows={5}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-placeholder)' }}>
              Variables are substituted when the canned response is inserted into a ticket comment.
            </p>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="shortcut" style={labelStyle}>Shortcut</label>
            <input id="shortcut" type="text" value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="e.g. /greet" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="category" style={labelStyle}>Category</label>
            <input id="category" type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Greetings" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="visibility" style={labelStyle}>Visibility</label>
            <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)} style={inputStyle}>
              <option value="PERSONAL">Personal</option>
              <option value="TEAM">Team</option>
              <option value="GLOBAL">Global</option>
            </select>
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

export default function CannedResponsesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<CannedResponse | null>(null);

  const { data, isLoading } = useQuery<CannedResponse[]>({
    queryKey: ['settings-canned-responses'],
    queryFn: async () => {
      const res = await fetch('/api/v1/canned-responses', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load canned responses');
      const json = await res.json();
      return Array.isArray(json) ? json : json.cannedResponses ?? json.data ?? [];
    },
  });

  const handleDelete = async (item: CannedResponse) => {
    if (!window.confirm(`Delete canned response "${item.title}"?`)) return;
    await fetch(`/api/v1/canned-responses/${item.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-canned-responses'] });
  };

  const items = data ?? [];
  const visibilityBadge = (v: string) => {
    const colors: Record<string, string> = { PERSONAL: 'var(--badge-blue-bg)', TEAM: 'var(--badge-green-bg)', GLOBAL: 'var(--badge-purple-bg, #e9d5ff)' };
    return (
      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: colors[v] ?? 'var(--bg-tertiary)' }}>
        {v}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTextBoxMultiple} size={1} color="#6366f1" />
          Canned Responses
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => { setEditItem(null); setShowModal(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Response
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
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Title</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Visibility</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Shortcut</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.title}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{item.category ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{visibilityBadge(item.visibility)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{item.shortcut ?? '—'}</td>
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
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No canned responses found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CannedResponseModal
          item={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-canned-responses'] })}
        />
      )}
    </div>
  );
}
