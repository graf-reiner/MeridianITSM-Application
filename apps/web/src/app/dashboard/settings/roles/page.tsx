'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiShieldAccount, mdiPlus, mdiPencil, mdiTrashCan } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  type: 'SYSTEM' | 'CUSTOM';
  permissions: string[];
  createdAt: string;
}

// ─── Available permissions grouped by domain ──────────────────────────────────

const PERMISSION_GROUPS: { label: string; permissions: string[] }[] = [
  {
    label: 'Tickets',
    permissions: ['TICKET_CREATE', 'TICKET_VIEW', 'TICKET_UPDATE', 'TICKET_CLOSE', 'TICKET_DELETE', 'TICKET_ASSIGN'],
  },
  {
    label: 'Knowledge Base',
    permissions: ['KNOWLEDGE_VIEW', 'KNOWLEDGE_CREATE', 'KNOWLEDGE_EDIT', 'KNOWLEDGE_PUBLISH'],
  },
  {
    label: 'CMDB',
    permissions: ['CMDB_VIEW', 'CMDB_EDIT', 'CMDB_DELETE', 'CMDB_IMPORT'],
  },
  {
    label: 'Settings',
    permissions: ['SETTINGS_VIEW', 'SETTINGS_EDIT', 'USER_MANAGE', 'ROLE_MANAGE'],
  },
  {
    label: 'Reports',
    permissions: ['REPORTS_VIEW', 'REPORTS_EXPORT'],
  },
];

// ─── Role Modal ───────────────────────────────────────────────────────────────

function RoleModal({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [permissions, setPermissions] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePermission = (perm: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(role ? `/api/v1/settings/roles/${role.id}` : '/api/v1/settings/roles', {
        method: role ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), permissions: Array.from(permissions) }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save role');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{role ? 'Edit Role' : 'Create Custom Role'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600, color: '#374151' }}>Role Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#374151' }}>Permissions</p>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label} style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{group.label}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.permissions.map((perm) => (
                    <label
                      key={perm}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 6, backgroundColor: permissions.has(perm) ? '#eef2ff' : '#f9fafb', color: permissions.has(perm) ? '#4f46e5' : '#374151' }}
                    >
                      <input
                        type="checkbox"
                        checked={permissions.has(perm)}
                        onChange={() => togglePermission(perm)}
                        style={{ cursor: 'pointer' }}
                      />
                      {perm.replace(/_/g, ' ')}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : role ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Roles Settings Page ──────────────────────────────────────────────────────

export default function RolesSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  const { data, isLoading } = useQuery<{ roles: Role[] }>({
    queryKey: ['settings-roles'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/roles', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load roles');
      return res.json() as Promise<{ roles: Role[] }>;
    },
  });

  const handleDelete = async (role: Role) => {
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    await fetch(`/api/v1/settings/roles/${role.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-roles'] });
  };

  const roles = data?.roles ?? [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiShieldAccount} size={1} color="#7c3aed" />
          Roles
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditRole(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Role
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading roles...</div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Permissions</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{role.name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: role.type === 'SYSTEM' ? '#dbeafe' : '#fef3c7', color: role.type === 'SYSTEM' ? '#1e40af' : '#92400e' }}>
                      {role.type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{role.permissions.length}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {role.type === 'CUSTOM' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setEditRole(role); setShowModal(true); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
                        >
                          <Icon path={mdiPencil} size={0.65} color="currentColor" />
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDelete(role)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}
                        >
                          <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>System role (read-only)</span>
                    )}
                  </td>
                </tr>
              ))}
              {roles.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No roles found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <RoleModal
          role={editRole}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-roles'] })}
        />
      )}
    </div>
  );
}
