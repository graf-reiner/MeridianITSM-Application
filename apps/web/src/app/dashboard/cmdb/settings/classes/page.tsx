'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiShapeOutline,
  mdiPlus,
  mdiPencil,
  mdiTrashCan,
  mdiCheckCircle,
  mdiCloseCircle,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CIClass {
  id: string;
  classKey: string;
  className: string;
  parentClassId: string | null;
  parentClass?: { id: string; className: string } | null;
  icon: string | null;
  description: string | null;
  isActive: boolean;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 100,
        padding: '12px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        backgroundColor: type === 'success' ? '#065f46' : '#991b1b',
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

// ─── Class Modal ──────────────────────────────────────────────────────────────

function ClassModal({
  ciClass,
  allClasses,
  onClose,
  onSaved,
}: {
  ciClass: CIClass | null;
  allClasses: CIClass[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [classKey, setClassKey] = useState(ciClass?.classKey ?? '');
  const [className, setClassName] = useState(ciClass?.className ?? '');
  const [parentClassId, setParentClassId] = useState(ciClass?.parentClassId ?? '');
  const [icon, setIcon] = useState(ciClass?.icon ?? '');
  const [description, setDescription] = useState(ciClass?.description ?? '');
  const [isActive, setIsActive] = useState(ciClass?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentOptions = allClasses.filter((c) => c.id !== ciClass?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        classKey: classKey.trim(),
        className: className.trim(),
        parentClassId: parentClassId || null,
        icon: icon.trim() || null,
        description: description.trim() || null,
        isActive,
      };
      const url = ciClass ? `/api/v1/cmdb/classes/${ciClass.id}` : '/api/v1/cmdb/classes';
      const res = await fetch(url, {
        method: ciClass ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save class');
      }
      onSaved(ciClass ? 'Class updated successfully' : 'Class created successfully');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 500, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{ciClass ? 'Edit CI Class' : 'Add CI Class'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="classKey" style={labelStyle}>Class Key *</label>
            <input id="classKey" type="text" value={classKey} onChange={(e) => setClassKey(e.target.value)} required placeholder="e.g. SERVER" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="className" style={labelStyle}>Class Name *</label>
            <input id="className" type="text" value={className} onChange={(e) => setClassName(e.target.value)} required placeholder="e.g. Server" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="parentClassId" style={labelStyle}>Parent Class</label>
            <select id="parentClassId" value={parentClassId} onChange={(e) => setParentClassId(e.target.value)} style={inputStyle}>
              <option value="">-- None (top-level) --</option>
              {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.className}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="icon" style={labelStyle}>Icon (MDI name)</label>
            <input id="icon" type="text" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. mdiServer" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="description" style={labelStyle}>Description</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="isActive" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>Active</label>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : ciClass ? 'Save Changes' : 'Add Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CI Classes Page ──────────────────────────────────────────────────────────

export default function CIClassesPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editClass, setEditClass] = useState<CIClass | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery<CIClass[]>({
    queryKey: ['cmdb-classes'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/classes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load CI classes');
      const json = await res.json();
      return Array.isArray(json) ? json : json.classes ?? json.data ?? [];
    },
  });

  const handleDelete = async (cls: CIClass) => {
    if (!window.confirm(`Delete class "${cls.className}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cmdb/classes/${cls.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to delete class');
      }
      setToast({ message: 'Class deleted', type: 'success' });
      void qc.invalidateQueries({ queryKey: ['cmdb-classes'] });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const classes = data ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
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
          {' > CI Classes'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiShapeOutline} size={1} color="#4f46e5" />
          CI Classes
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditClass(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Class
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading CI classes...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Icon</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Class Key</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Class Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Parent Class</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Active</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls, i) => (
                <tr key={cls.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined }}>
                  <td style={{ padding: '10px 14px' }}>
                    {cls.icon ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{cls.icon}</span>
                    ) : (
                      <span style={{ color: 'var(--text-placeholder)' }}>--</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 13 }}>{cls.classKey}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{cls.className}</td>
                  <td style={{ padding: '10px 14px', color: cls.parentClass ? 'var(--text-secondary)' : 'var(--text-placeholder)', fontSize: 13 }}>
                    {cls.parentClass?.className ?? '--'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Icon path={cls.isActive ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={cls.isActive ? '#059669' : '#9ca3af'} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditClass(cls); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(cls)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {classes.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No CI classes defined yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ClassModal
          ciClass={editClass}
          allClasses={classes}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => {
            setToast({ message: msg, type: 'success' });
            void qc.invalidateQueries({ queryKey: ['cmdb-classes'] });
          }}
        />
      )}
    </div>
  );
}
