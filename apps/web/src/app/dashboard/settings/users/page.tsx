'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiAccountGroup, mdiPlus, mdiMagnify, mdiPencil, mdiLockReset, mdiShieldOff } from '@mdi/js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface UserListResponse {
  users: User[];
  total: number;
}

interface RoleOption {
  id: string;
  name: string;
  type: string;
}

// ─── Create/Edit User Modal ───────────────────────────────────────────────────

function UserModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User | null;
  roles: RoleOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role ?? 'agent');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { firstName, lastName, email, role };
      if (!user && password) body.password = password;
      if (user && password) body.password = password;

      const res = await fetch(user ? `/api/v1/settings/users/${user.id}` : '/api/v1/settings/users', {
        method: user ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save user');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 as const, color: '#374151' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111827' }}>
            {user ? 'Edit User' : 'Create User'}
          </h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label htmlFor="firstName" style={labelStyle}>First Name *</label>
              <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="lastName" style={labelStyle}>Last Name *</label>
              <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="email" style={labelStyle}>Email *</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="password" style={labelStyle}>{user ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!user} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="role" style={labelStyle}>Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              <option value="admin">Admin</option>
              <option value="msp_admin">MSP Admin</option>
              <option value="agent">Agent</option>
              <option value="end_user">End User</option>
              {roles.filter((r) => r.type === 'CUSTOM').map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : '#4f46e5', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : user ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Users Settings Page ──────────────────────────────────────────────────────

export default function UsersSettingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const PAGE_SIZE = 25;

  const { data, isLoading } = useQuery<UserListResponse>({
    queryKey: ['settings-users', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      const res = await fetch(`/api/v1/settings/users?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load users');
      const json = await res.json();
      // Normalize: API may use status string instead of isActive boolean
      const normalize = (list: any[]) =>
        list.map((u: any) => ({
          ...u,
          isActive: u.isActive ?? (u.status === 'ACTIVE'),
          role: u.role ?? u.userRoles?.[0]?.role?.name ?? '',
        }));
      // API returns { data: [...], meta: { total, ... } } or { users: [...], total }
      if (json.data && json.meta) {
        return { users: normalize(json.data), total: json.meta.total };
      }
      if (Array.isArray(json)) {
        return { users: normalize(json), total: json.length };
      }
      if (json.users) {
        return { users: normalize(json.users), total: json.total ?? json.users.length };
      }
      return json as UserListResponse;
    },
  });

  const { data: rolesData } = useQuery<RoleOption[]>({
    queryKey: ['settings-roles-minimal'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/roles', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : json.roles ?? [];
    },
  });

  const handleToggleActive = async (user: User) => {
    await fetch(`/api/v1/settings/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !user.isActive, status: user.isActive ? 'INACTIVE' : 'ACTIVE' }),
    });
    void qc.invalidateQueries({ queryKey: ['settings-users'] });
  };

  const handleResetPassword = () => {
    // In a real app, this would email a reset link
    window.alert('Password reset email would be sent (not wired to email service in this demo).');
  };

  const handleClearMfa = async (user: User) => {
    if (!window.confirm(`Clear all MFA devices for ${user.firstName} ${user.lastName}? They will need to re-enroll.`)) return;
    try {
      await fetch(`/api/v1/settings/users/${user.id}/clear-mfa`, { method: 'POST', credentials: 'include' });
      window.alert('MFA devices cleared successfully.');
    } catch {
      window.alert('Failed to clear MFA devices.');
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const roles = rolesData ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiAccountGroup} size={1} color="#4f46e5" />
          Users
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditUser(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New User
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 320, marginBottom: 16 }}>
        <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <Icon path={mdiMagnify} size={0.8} color="#9ca3af" />
        </div>
        <input
          type="search"
          placeholder="Search users..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: '100%', padding: '8px 10px 8px 34px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading users...</div>
      ) : (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Email</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Role</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{user.firstName} {user.lastName}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{user.email}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{user.role}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 500, backgroundColor: user.isActive ? '#d1fae5' : '#f3f4f6', color: user.isActive ? '#065f46' : '#6b7280' }}>
                      {user.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { setEditUser(user); setShowModal(true); }}
                        title="Edit"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleToggleActive(user)}
                        style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: user.isActive ? '#dc2626' : '#059669' }}
                      >
                        {user.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={handleResetPassword}
                        title="Reset Password"
                        style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#374151' }}
                      >
                        <Icon path={mdiLockReset} size={0.65} color="currentColor" />
                      </button>
                      <button
                        onClick={() => void handleClearMfa(user)}
                        title="Clear MFA"
                        style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: '#fff', color: '#dc2626' }}
                      >
                        <Icon path={mdiShieldOff} size={0.65} color="currentColor" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontSize: 14 }}>Previous</button>
          <span style={{ fontSize: 14, color: '#6b7280' }}>Page {page} of {totalPages} ({total})</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, backgroundColor: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1, fontSize: 14 }}>Next</button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <UserModal
          user={editUser}
          roles={roles}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-users'] })}
        />
      )}
    </div>
  );
}
