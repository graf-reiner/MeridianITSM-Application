'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiRelationManyToMany,
  mdiPlus,
  mdiPencil,
  mdiTrashCan,
  mdiCheckCircle,
  mdiCloseCircle,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RelationshipType {
  id: string;
  relationshipKey: string;
  relationshipName: string;
  forwardLabel: string;
  reverseLabel: string;
  isDirectional: boolean;
  description: string | null;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 100,
        padding: '12px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500,
        backgroundColor: type === 'success' ? '#065f46' : '#991b1b', color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

// ─── Relationship Type Modal ──────────────────────────────────────────────────

function RelationshipTypeModal({
  relType,
  onClose,
  onSaved,
}: {
  relType: RelationshipType | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [relationshipKey, setRelationshipKey] = useState(relType?.relationshipKey ?? '');
  const [relationshipName, setRelationshipName] = useState(relType?.relationshipName ?? '');
  const [forwardLabel, setForwardLabel] = useState(relType?.forwardLabel ?? '');
  const [reverseLabel, setReverseLabel] = useState(relType?.reverseLabel ?? '');
  const [isDirectional, setIsDirectional] = useState(relType?.isDirectional ?? true);
  const [description, setDescription] = useState(relType?.description ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        relationshipKey: relationshipKey.trim(),
        relationshipName: relationshipName.trim(),
        forwardLabel: forwardLabel.trim(),
        reverseLabel: reverseLabel.trim(),
        isDirectional,
        description: description.trim() || null,
      };
      const url = relType ? `/api/v1/cmdb/relationship-types/${relType.id}` : '/api/v1/cmdb/relationship-types';
      const res = await fetch(url, {
        method: relType ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save relationship type');
      }
      onSaved(relType ? 'Relationship type updated' : 'Relationship type created');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save relationship type');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 520, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{relType ? 'Edit Relationship Type' : 'Add Relationship Type'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="relationshipKey" style={labelStyle}>Relationship Key *</label>
            <input id="relationshipKey" type="text" value={relationshipKey} onChange={(e) => setRelationshipKey(e.target.value)} required placeholder="e.g. DEPENDS_ON" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="relationshipName" style={labelStyle}>Relationship Name *</label>
            <input id="relationshipName" type="text" value={relationshipName} onChange={(e) => setRelationshipName(e.target.value)} required placeholder="e.g. Depends On" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="forwardLabel" style={labelStyle}>Forward Label *</label>
            <input id="forwardLabel" type="text" value={forwardLabel} onChange={(e) => setForwardLabel(e.target.value)} required placeholder='e.g. "depends on"' style={inputStyle} />
            <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>Displayed as: Source [forward label] Target</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="reverseLabel" style={labelStyle}>Reverse Label *</label>
            <input id="reverseLabel" type="text" value={reverseLabel} onChange={(e) => setReverseLabel(e.target.value)} required placeholder='e.g. "is depended on by"' style={inputStyle} />
            <span style={{ fontSize: 12, color: 'var(--text-placeholder)' }}>Displayed as: Target [reverse label] Source</span>
          </div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="isDirectional" type="checkbox" checked={isDirectional} onChange={(e) => setIsDirectional(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="isDirectional" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>Directional</label>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="description" style={labelStyle}>Description</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : relType ? 'Save Changes' : 'Add Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CMDB Relationship Types Page ─────────────────────────────────────────────

export default function CMDBRelationshipTypesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editType, setEditType] = useState<RelationshipType | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery<RelationshipType[]>({
    queryKey: ['cmdb-relationship-types'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/relationship-types', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load relationship types');
      const json = await res.json();
      return Array.isArray(json) ? json : json.relationshipTypes ?? json.data ?? [];
    },
  });

  const handleDelete = async (rt: RelationshipType) => {
    if (!window.confirm(`Delete relationship type "${rt.relationshipName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cmdb/relationship-types/${rt.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to delete relationship type');
      }
      setToast({ message: 'Relationship type deleted', type: 'success' });
      void qc.invalidateQueries({ queryKey: ['cmdb-relationship-types'] });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const types = data ?? [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Breadcrumb + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Link href="/dashboard/cmdb/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <span style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>
          <Link href="/dashboard/cmdb" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CMDB</Link>
          {' > '}
          <Link href="/dashboard/cmdb/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Settings</Link>
          {' > Relationship Types'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiRelationManyToMany} size={1} color="#7c3aed" />
          Relationship Types
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditType(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Relationship Type
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading relationship types...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Key</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Forward Label</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Reverse Label</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Directional</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((rt, i) => (
                <tr key={rt.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 13 }}>{rt.relationshipKey}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{rt.relationshipName}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>{rt.forwardLabel}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>{rt.reverseLabel}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Icon path={rt.isDirectional ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={rt.isDirectional ? '#7c3aed' : '#9ca3af'} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditType(rt); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(rt)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {types.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No relationship types defined yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <RelationshipTypeModal
          relType={editType}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => {
            setToast({ message: msg, type: 'success' });
            void qc.invalidateQueries({ queryKey: ['cmdb-relationship-types'] });
          }}
        />
      )}
    </div>
  );
}
