'use client';

import { useState, useEffect, useCallback } from 'react';
import { ownerFetch } from '../../../lib/api';
import SmtpSettings from '../../../components/SmtpSettings';

interface OwnerUser {
  id: string;
  email: string;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem('owner_token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]!));
    return (payload as { ownerUserId?: string }).ownerUserId ?? null;
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwResult, setPwResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Owner users state
  const [users, setUsers] = useState<OwnerUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addResult, setAddResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const currentUserId = getCurrentUserId();

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await ownerFetch('/api/owner-users');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { users: OwnerUser[] };
      setUsers(data.users);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwResult(null);

    if (newPassword !== confirmPassword) {
      setPwResult({ type: 'error', msg: 'New passwords do not match' });
      return;
    }
    if (newPassword.length < 8) {
      setPwResult({ type: 'error', msg: 'New password must be at least 8 characters' });
      return;
    }

    setPwLoading(true);
    try {
      const res = await ownerFetch('/api/owner-users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPwResult({ type: 'success', msg: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to change password' });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddResult(null);
    setAddLoading(true);
    try {
      const res = await ownerFetch('/api/owner-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newUserPassword }),
      });
      const data = await res.json() as { error?: string; user?: OwnerUser };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAddResult({ type: 'success', msg: `User ${newEmail} created successfully` });
      setNewEmail('');
      setNewUserPassword('');
      setShowAddForm(false);
      void fetchUsers();
    } catch (err) {
      setAddResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to create user' });
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(userId: string) {
    setDeleteResult(null);
    setDeleteLoading(true);
    try {
      const res = await ownerFetch(`/api/owner-users/${userId}`, { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDeleteConfirm(null);
      void fetchUsers();
    } catch (err) {
      setDeleteResult({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to delete user' });
    } finally {
      setDeleteLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '4px',
  };

  const primaryBtn: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };

  const dangerBtn: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '500',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };

  const ghostBtn: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '13px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: 0 }}>Settings</h1>
        <p style={{ color: '#6b7280', marginTop: '4px' }}>Manage your password and owner admin users</p>
      </div>

      {/* Section 1: Change Password */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          padding: '24px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px' }}>Change Password</h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
          Update the password for your owner admin account.
        </p>

        <form onSubmit={(e) => void handleChangePassword(e)} style={{ maxWidth: '400px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              style={inputStyle}
              autoComplete="current-password"
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
              style={inputStyle}
              autoComplete="new-password"
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={inputStyle}
              autoComplete="new-password"
            />
          </div>

          {pwResult && (
            <div
              style={{
                marginBottom: '16px',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '13px',
                color: pwResult.type === 'success' ? '#166534' : '#991b1b',
                backgroundColor: pwResult.type === 'success' ? '#dcfce7' : '#fee2e2',
              }}
            >
              {pwResult.msg}
            </div>
          )}

          <button type="submit" disabled={pwLoading} style={{ ...primaryBtn, opacity: pwLoading ? 0.6 : 1, cursor: pwLoading ? 'not-allowed' : 'pointer' }}>
            {pwLoading ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Section 2: Owner Users */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: '0 0 4px' }}>Owner Users</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
              Manage accounts with access to the owner admin panel.
            </p>
          </div>
          <button
            onClick={() => { setShowAddForm(v => !v); setAddResult(null); }}
            style={primaryBtn}
          >
            {showAddForm ? 'Cancel' : '+ Add User'}
          </button>
        </div>

        {/* Add User Form */}
        {showAddForm && (
          <form
            onSubmit={(e) => void handleAddUser(e)}
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: '0 0 12px' }}>New Owner User</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {addResult && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: addResult.type === 'success' ? '#166534' : '#991b1b',
                  backgroundColor: addResult.type === 'success' ? '#dcfce7' : '#fee2e2',
                }}
              >
                {addResult.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" disabled={addLoading} style={{ ...primaryBtn, opacity: addLoading ? 0.6 : 1, cursor: addLoading ? 'not-allowed' : 'pointer' }}>
                {addLoading ? 'Creating...' : 'Create User'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={ghostBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {deleteResult && (
          <div
            style={{
              marginBottom: '16px',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#991b1b',
              backgroundColor: '#fee2e2',
            }}
          >
            {deleteResult.msg}
          </div>
        )}

        {/* Users Table */}
        {usersLoading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#6b7280', fontSize: '14px' }}>Loading users...</div>
        ) : usersError ? (
          <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '4px', color: '#991b1b', fontSize: '13px' }}>
            Error: {usersError}
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '14px' }}>No owner users found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MFA Status</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Login</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px', color: '#111827', fontWeight: '500' }}>
                    {user.email}
                    {user.id === currentUserId && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: '#ede9fe', color: '#5b21b6', padding: '2px 6px', borderRadius: '9999px', fontWeight: '500' }}>
                        You
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: user.totpEnabled ? '#dcfce7' : '#f3f4f6',
                        color: user.totpEnabled ? '#166534' : '#6b7280',
                      }}
                    >
                      {user.totpEnabled ? 'MFA Enabled' : 'No MFA'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#6b7280' }}>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '12px', color: '#6b7280' }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {user.id === currentUserId ? (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>
                    ) : deleteConfirm === user.id ? (
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>Confirm?</span>
                        <button
                          onClick={() => void handleDelete(user.id)}
                          disabled={deleteLoading}
                          style={{ ...dangerBtn, padding: '4px 10px', fontSize: '12px', opacity: deleteLoading ? 0.6 : 1 }}
                        >
                          {deleteLoading ? '...' : 'Delete'}
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: '12px' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setDeleteConfirm(user.id); setDeleteResult(null); }}
                        style={{ ...dangerBtn, padding: '6px 12px', fontSize: '13px' }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── SMTP Email Configuration ───────────────────────────────────────── */}
      <SmtpSettings />
    </div>
  );
}
