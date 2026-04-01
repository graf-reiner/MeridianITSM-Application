'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiAccountMultiple, mdiPlus, mdiPencil, mdiTrashCan, mdiAccountPlus, mdiAccountMinus } from '@mdi/js';
import RichTextField from '@/components/RichTextField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Group {
  id: string;
  name: string;
  email: string | null;
  description: string | null;
  _count?: { userGroupMembers: number };
}

interface GroupMember {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    status: string;
  };
}

interface UserOption {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// ─── Group Modal (Create / Edit) ─────────────────────────────────────────────

function GroupModal({ group, onClose, onSaved }: { group: Group | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [email, setEmail] = useState(group?.email ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), email: email.trim() || undefined, description: description.trim() || undefined };
      const res = await fetch(group ? `/api/v1/settings/groups/${group.id}` : '/api/v1/settings/groups', {
        method: group ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to save group');
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
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 480, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{group ? 'Edit Group' : 'Create Group'}</h2>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="groupName" style={labelStyle}>Name *</label>
            <input id="groupName" type="text" value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} placeholder="e.g. Network Team" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="groupEmail" style={labelStyle}>Group Email</label>
            <input id="groupEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="network-team@company.com" />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-placeholder)' }}>Optional shared mailbox for the group</p>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="groupDesc" style={labelStyle}>Description</label>
            <RichTextField value={description} onChange={setDescription} placeholder="What this group is responsible for..." minHeight={80} compact />
          </div>
          {error && <div style={{ padding: '8px 12px', backgroundColor: 'var(--badge-red-bg-subtle)', border: '1px solid #fecaca', borderRadius: 7, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={isSaving} style={{ padding: '8px 18px', backgroundColor: isSaving ? '#a5b4fc' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer' }}>
              {isSaving ? 'Saving...' : group ? 'Save Changes' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Members Panel ────────────────────────────────────────────────────────────

function MembersPanel({ group, onClose }: { group: Group; onClose: () => void }) {
  const qc = useQueryClient();
  const [addUserId, setAddUserId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const { data: members, isLoading } = useQuery<GroupMember[]>({
    queryKey: ['group-members', group.id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/settings/groups/${group.id}/members`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load members');
      return res.json();
    },
  });

  const { data: usersData } = useQuery<UserOption[]>({
    queryKey: ['settings-users-for-groups'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/users?isActive=true&pageSize=200', { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json.users ?? (Array.isArray(json) ? json : []);
    },
  });

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const availableUsers = (usersData ?? []).filter((u) => !memberIds.has(u.id));

  const handleAdd = async () => {
    if (!addUserId) return;
    setIsAdding(true);
    try {
      await fetch(`/api/v1/settings/groups/${group.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: addUserId }),
      });
      setAddUserId('');
      void qc.invalidateQueries({ queryKey: ['group-members', group.id] });
      void qc.invalidateQueries({ queryKey: ['settings-groups'] });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    await fetch(`/api/v1/settings/groups/${group.id}/members/${userId}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['group-members', group.id] });
    void qc.invalidateQueries({ queryKey: ['settings-groups'] });
  };

  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border-secondary)', borderRadius: 7, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: 12, width: '100%', maxWidth: 560, overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Members &mdash; {group.name}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ padding: 24 }}>
          {/* Add member */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Select a user to add...</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>
              ))}
            </select>
            <button
              onClick={() => void handleAdd()}
              disabled={!addUserId || isAdding}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px', backgroundColor: !addUserId || isAdding ? 'var(--border-secondary)' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: !addUserId || isAdding ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
            >
              <Icon path={mdiAccountPlus} size={0.7} color="currentColor" />
              Add
            </button>
          </div>

          {/* Member list */}
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading members...</div>
          ) : (members ?? []).length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 14 }}>No members yet. Add users above.</div>
          ) : (
            <div style={{ border: '1px solid var(--border-primary)', borderRadius: 8, overflow: 'hidden' }}>
              {(members ?? []).map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: i < (members!.length - 1) ? '1px solid var(--bg-tertiary)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {m.user.displayName || `${m.user.firstName} ${m.user.lastName}`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.user.email}</div>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, backgroundColor: m.user.status === 'ACTIVE' ? 'var(--badge-green-bg)' : 'var(--bg-tertiary)', color: m.user.status === 'ACTIVE' ? '#065f46' : '#6b7280', marginRight: 8 }}>
                    {m.user.status}
                  </span>
                  <button
                    onClick={() => void handleRemove(m.userId)}
                    title="Remove from group"
                    style={{ display: 'flex', alignItems: 'center', padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626' }}
                  >
                    <Icon path={mdiAccountMinus} size={0.8} color="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Groups Settings Page ─────────────────────────────────────────────────────

export default function GroupsSettingsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [membersGroup, setMembersGroup] = useState<Group | null>(null);

  const { data, isLoading } = useQuery<Group[]>({
    queryKey: ['settings-groups'],
    queryFn: async () => {
      const res = await fetch('/api/v1/settings/groups', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load groups');
      const json = await res.json();
      return Array.isArray(json) ? json : json.groups ?? [];
    },
  });

  const handleDelete = async (group: Group) => {
    if (!window.confirm(`Delete group "${group.name}"? All members will be removed.`)) return;
    await fetch(`/api/v1/settings/groups/${group.id}`, { method: 'DELETE', credentials: 'include' });
    void qc.invalidateQueries({ queryKey: ['settings-groups'] });
  };

  const groups = data ?? [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href="/dashboard/settings" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Icon path={mdiArrowLeft} size={0.9} color="currentColor" />
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon path={mdiAccountMultiple} size={1} color="#059669" />
          Groups
        </h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setEditGroup(null); setShowModal(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon path={mdiPlus} size={0.8} color="currentColor" />
            New Group
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading groups...</div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Description</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Members</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{group.name}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{group.email || '\u2014'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.description || '\u2014'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <button
                      onClick={() => setMembersGroup(group)}
                      style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, backgroundColor: 'var(--badge-purple-bg)', color: '#5b21b6', border: 'none', cursor: 'pointer' }}
                    >
                      {group._count?.userGroupMembers ?? 0}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setMembersGroup(group)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiAccountPlus} size={0.65} color="currentColor" />
                        Members
                      </button>
                      <button
                        onClick={() => { setEditGroup(group); setShowModal(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--border-secondary)', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        <Icon path={mdiPencil} size={0.65} color="currentColor" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDelete(group)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', backgroundColor: 'var(--bg-primary)', color: '#dc2626' }}
                      >
                        <Icon path={mdiTrashCan} size={0.65} color="currentColor" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-placeholder)' }}>No groups found. Create one to organize your team.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <GroupModal
          group={editGroup}
          onClose={() => setShowModal(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['settings-groups'] })}
        />
      )}

      {membersGroup && (
        <MembersPanel
          group={membersGroup}
          onClose={() => setMembersGroup(null)}
        />
      )}
    </div>
  );
}
