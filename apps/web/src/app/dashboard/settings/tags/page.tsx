'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiTagMultiple, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tag {
  id: string;
  name: string;
  color: string;
}

// ─── Tag Modal ────────────────────────────────────────────────────────────────

function TagModal({ tag, onClose, onSaved }: { tag: Tag | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tag?.name ?? '');
  const [color, setColor] = useState(tag?.color ?? '#6b7280');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        color,
      };
      const res = await fetch(tag ? `/api/v1/settings/tags/${tag.id}` : '/api/v1/settings/tags', {
        method: tag ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save tag');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tag');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{tag ? 'Edit Tag' : 'Create Tag'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="name" style={labelStyle}>Name *</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="color" style={labelStyle}>Color</label>
            <input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inputStyle, padding: 4, height: 40, cursor: 'pointer' }} />
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : tag ? 'Save Changes' : 'Create Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tags Settings Page ───────────────────────────────────────────────────────

export default function TagsSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);

  const { data, isLoading } = useQuery<Tag[]>({
    queryKey: ['settings-tags'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/tags', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load tags');
      const json = await res.json();
      return Array.isArray(json) ? json : json.tags ?? [];
    },
  });

  const handleDelete = async (tag: Tag) => {
    if (!window.confirm(`Delete tag "${tag.name}"?`)) return;
    await fetch(`/api/v1/settings/tags/${tag.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-tags'] });
  };

  const tags = data ?? [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiTagMultiple} size={1} color="#8b5cf6" />
          Tags
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditTag(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Tag
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading tags...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Color</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', backgroundColor: tag.color, border: '1px solid var(--border-secondary)' }} />
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{tag.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditTag(tag); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(tag)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tags.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No tags found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <TagModal
          tag={editTag}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-tags'] })}
        />
      )}
    </div>
  );
}
