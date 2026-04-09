'use client';

import { useState, useEffect } from 'react';
import Icon from '@mdi/react';
import Breadcrumb from '@/components/Breadcrumb';
import {
  mdiAccountCircle,
  mdiContentSave,
  mdiLoading,
  mdiCheckCircle,
} from '@mdi/js';

interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  themePreference: string;
  userRoles: Array<{ role: { name: string; slug: string } }>;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/v1/profile', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load profile');
        const data = (await res.json()) as Profile;
        setProfile(data);
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setDisplayName(data.displayName ?? '');
        setPhone(data.phone ?? '');
        setJobTitle(data.jobTitle ?? '');
        setDepartment(data.department ?? '');
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    void fetchProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch('/api/v1/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          displayName: displayName || null,
          phone: phone || null,
          jobTitle: jobTitle || null,
          department: department || null,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to update profile');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Icon path={mdiLoading} size={1.5} spin color="var(--text-muted)" />
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Breadcrumb items={[{ label: 'Settings', href: '/dashboard/settings' }, { label: 'My Profile' }]} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Icon path={mdiAccountCircle} size={1.2} color="var(--accent-primary)" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          My Profile
        </h1>
      </div>

      {/* Read-only info */}
      {profile && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 10,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            marginBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <strong>Email:</strong> {profile.email}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <strong>Role:</strong>{' '}
            {profile.userRoles.map((r) => r.role.name).join(', ') || 'No role assigned'}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {saved && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon path={mdiCheckCircle} size={0.65} color="#166534" />
          Profile updated successfully.
        </div>
      )}

      <form onSubmit={handleSave}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              style={fieldStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How your name appears to others (optional)"
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            style={fieldStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <label style={labelStyle}>Job Title</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., IT Administrator"
              style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Department</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g., Information Technology"
              style={fieldStyle}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '11px 24px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          <Icon path={saving ? mdiLoading : mdiContentSave} size={0.8} color="#fff" spin={saving} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
