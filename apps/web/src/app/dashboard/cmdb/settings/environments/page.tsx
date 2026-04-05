'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import {
  mdiArrowLeft,
  mdiEarth,
  mdiPlus,
  mdiPencil,
  mdiTrashCan,
  mdiCheckCircle,
  mdiCloseCircle,
} from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CmdbEnvironment {
  id: string;
  envKey: string;
  envName: string;
  sortOrder: number;
  isActive: boolean;
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

// ─── Environment Modal ────────────────────────────────────────────────────────

function EnvironmentModal({
  env,
  onClose,
  onSaved,
}: {
  env: CmdbEnvironment | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [envKey, setEnvKey] = useState(env?.envKey ?? '');
  const [envName, setEnvName] = useState(env?.envName ?? '');
  const [sortOrder, setSortOrder] = useState(env?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState(env?.isActive ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        envKey: envKey.trim(),
        envName: envName.trim(),
        sortOrder,
        isActive,
      };
      const url = env ? `/api/v1/cmdb/environments/${env.id}` : '/api/v1/cmdb/environments';
      const res = await fetch(url, {
        method: env ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save environment');
      }
      onSaved(env ? 'Environment updated successfully' : 'Environment created successfully');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save environment');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: 'var(--text-secondary)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 460, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{env ? 'Edit Environment' : 'Add Environment'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="envKey" style={labelStyle}>Environment Key *</label>
            <input id="envKey" type="text" value={envKey} onChange={(e) => setEnvKey(e.target.value)} required placeholder="e.g. PRODUCTION" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="envName" style={labelStyle}>Environment Name *</label>
            <input id="envName" type="text" value={envName} onChange={(e) => setEnvName(e.target.value)} required placeholder="e.g. Production" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="sortOrder" style={labelStyle}>Sort Order</label>
            <input id="sortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="isActive" style={{ fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer' }}>Active</label>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : env ? 'Save Changes' : 'Add Environment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CMDB Environments Page ───────────────────────────────────────────────────

export default function CMDBEnvironmentsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editEnv, setEditEnv] = useState<CmdbEnvironment | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery<CmdbEnvironment[]>({
    queryKey: ['cmdb-environments'],
    queryFn: async () => {
      const res = await fetch('/api/v1/cmdb/environments', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load environments');
      const json = await res.json();
      return Array.isArray(json) ? json : json.environments ?? json.data ?? [];
    },
  });

  const handleDelete = async (env: CmdbEnvironment) => {
    if (!window.confirm(`Delete environment "${env.envName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cmdb/environments/${env.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? 'Failed to delete environment');
      }
      setToast({ message: 'Environment deleted', type: 'success' });
      void qc.invalidateQueries({ queryKey: ['cmdb-environments'] });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const environments = (data ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
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
          {' > Environments'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiEarth} size={1} color="#0891b2" />
          Environments
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditEnv(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            Add Environment
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading environments...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Env Key</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Env Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Sort Order</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Active</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {environments.map((env, i) => (
                <tr key={env.id} style={{ borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 13 }}>{env.envKey}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{env.envName}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)' }}>{env.sortOrder}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <Icon path={env.isActive ? mdiCheckCircle : mdiCloseCircle} size={0.8} color={env.isActive ? '#059669' : '#9ca3af'} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditEnv(env); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(env)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {environments.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No environments defined yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <EnvironmentModal
          env={editEnv}
          onClose={() => setShowModal(false)}
          onSaved={(msg) => {
            setToast({ message: msg, type: 'success' });
            void qc.invalidateQueries({ queryKey: ['cmdb-environments'] });
          }}
        />
      )}
    </div>
  );
}
